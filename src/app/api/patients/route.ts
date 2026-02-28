import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

const KEY_LAB_NAMES = ['HGB','HCT','ALB','BUN','CREAT','NA','K','CO2','GLU','WBC','PLATELET','INR','CA','MG','FE','FERRITIN'];

interface LabValue {
    date: string;
    value: number;
    unit: string;
    referenceRange: string;
}

async function getLatestLabsForPatients(simplIds: string[]): Promise<Record<string, Record<string, LabValue>>> {
    if (simplIds.length === 0) return {};

    const res = await query<{
        simpl_id: string;
        observation_name: string;
        value_numeric: string;
        unit: string;
        reference_range: string;
        effective_at: string;
    }>(
        `SELECT DISTINCT ON (simpl_id, observation_name)
            simpl_id, observation_name, value_numeric, unit, reference_range,
            effective_at::text
         FROM lab_results
         WHERE simpl_id = ANY($1)
           AND observation_name = ANY($2)
           AND value_numeric IS NOT NULL
         ORDER BY simpl_id, observation_name, effective_at DESC`,
        [simplIds, KEY_LAB_NAMES]
    );

    const result: Record<string, Record<string, LabValue>> = {};
    for (const row of res.rows) {
        const val = parseFloat(String(row.value_numeric));
        if (isNaN(val)) continue;
        if (!result[row.simpl_id]) result[row.simpl_id] = {};
        result[row.simpl_id][row.observation_name] = {
            date: row.effective_at,
            value: val,
            unit: row.unit ?? '',
            referenceRange: row.reference_range ?? '',
        };
    }
    return result;
}

async function getPatientsFromDb(facilityFilter?: string) {
    const facilityClause = facilityFilter
        ? `AND (LOWER(COALESCE(f.name,'')) LIKE LOWER($1) OR CAST(p.fac_id AS TEXT) = $2)`
        : '';
    const rawId = facilityFilter ? facilityFilter.replace(/\D/g, '') : '';
    const param = facilityFilter ? [`%${facilityFilter}%`, rawId || '-1'] : [];

    const res = await query<{
        simpl_id: string;
        first_name: string;
        last_name: string;
        date_of_birth: string;
        patient_status: string;
        fac_id: number;
        room: string;
        bed: string;
        unit: string;
        admit_date: string;
        last_synced_at: string;
        facility_name: string;
        infusion_severity: string;
        infusion_score: number;
        infusion_priority: string;
        infusion_reasoning: string;
        infusion_indicators: Record<string, unknown>;
        transfusion_severity: string;
        transfusion_score: number;
        transfusion_priority: string;
        transfusion_reasoning: string;
        transfusion_indicators: Record<string, unknown>;
        combined_urgency: number;
    }>(
        `SELECT
            p.simpl_id, p.first_name, p.last_name, p.date_of_birth,
            p.patient_status, p.fac_id, p.room, p.bed, p.unit,
            p.admit_date, p.last_synced_at,
            f.name AS facility_name,
            inf.severity      AS infusion_severity,
            inf.score         AS infusion_score,
            inf.priority      AS infusion_priority,
            inf.reasoning     AS infusion_reasoning,
            inf.key_indicators AS infusion_indicators,
            tra.severity      AS transfusion_severity,
            tra.score         AS transfusion_score,
            tra.priority      AS transfusion_priority,
            tra.reasoning     AS transfusion_reasoning,
            tra.key_indicators AS transfusion_indicators,
            GREATEST(
                CASE inf.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END,
                CASE tra.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END
            ) AS combined_urgency
         FROM patients p
         LEFT JOIN facilities f ON f.fac_id = p.fac_id
         LEFT JOIN analysis_results inf ON inf.simpl_id = p.simpl_id AND inf.analysis_type = 'infusion' AND inf.is_current = TRUE
         LEFT JOIN analysis_results tra ON tra.simpl_id = p.simpl_id AND tra.analysis_type = 'transfusion' AND tra.is_current = TRUE
         WHERE 1=1
         ${facilityClause}
         ORDER BY
           CASE WHEN (p.patient_status = 'Current' OR p.patient_status IS NULL) THEN 0 ELSE 1 END,
           combined_urgency DESC NULLS LAST, p.last_name`,
        param
    );

    const simplIds = res.rows.map(r => r.simpl_id);
    const labsMap = await getLatestLabsForPatients(simplIds);

    const now = Date.now();
    const patients = res.rows.map(r => {
        const admitDate = r.admit_date ? new Date(r.admit_date) : null;
        const daysInFacility = admitDate
            ? Math.floor((now - admitDate.getTime()) / 86400000)
            : null;

        return {
            simpl_id: r.simpl_id,
            first_name: r.first_name,
            last_name: r.last_name,
            date_of_birth: r.date_of_birth ?? null,
            patient_status: r.patient_status ?? 'Current',
            fac_id: r.fac_id,
            facility: r.facility_name,
            room: r.room ?? null,
            bed: r.bed ?? null,
            unit: r.unit ?? null,
            admit_date: r.admit_date ?? null,
            days_in_facility: daysInFacility,
            last_synced_at: r.last_synced_at ?? null,
            labs_latest: labsMap[r.simpl_id] ?? {},
            db_analysis: {
                infusion: r.infusion_severity ? {
                    severity: r.infusion_severity,
                    score: r.infusion_score,
                    priority: r.infusion_priority,
                    reasoning: r.infusion_reasoning,
                    indicators: r.infusion_indicators,
                } : null,
                transfusion: r.transfusion_severity ? {
                    severity: r.transfusion_severity,
                    score: r.transfusion_score,
                    priority: r.transfusion_priority,
                    reasoning: r.transfusion_reasoning,
                    indicators: r.transfusion_indicators,
                } : null,
            },
            combined_urgency: r.combined_urgency ?? 0,
            data_source: 'live_db',
        };
    });

    const lastRefreshed = res.rows.find(r => r.last_synced_at)?.last_synced_at
        ?? new Date().toISOString();

    return { patients, lastRefreshed };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const facilityFilter = searchParams.get('facility')?.trim();

        if (!isDbConfigured()) {
            return NextResponse.json(
                { error: 'Database not configured', patients: [], lastRefreshed: null },
                { status: 503 }
            );
        }

        const dbResult = await getPatientsFromDb(facilityFilter ?? undefined);
        return NextResponse.json({ ...dbResult, data_source: 'live_db' });
    } catch (error) {
        console.error('[/api/patients] Error:', error);
        return NextResponse.json({ error: 'Internal server error', patients: [] }, { status: 500 });
    }
}
