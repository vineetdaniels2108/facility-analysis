import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

const KEY_LAB_NAMES = ['HGB','HCT','ALB','BUN','CREAT','NA','K','CO2','GLU','WBC','PLATELET','INR','CA','MG','FE','FERRITIN'];
const ANALYSIS_TYPES = ['infusion', 'transfusion', 'foley_risk', 'gtube_risk', 'mtn_risk',
    'ai_infusion', 'ai_transfusion', 'ai_foley_risk', 'ai_gtube_risk', 'ai_mtn_risk'] as const;

interface LabValue {
    date: string;
    value: number;
    unit: string;
    referenceRange: string;
}

interface AnalysisRow {
    simpl_id: string;
    analysis_type: string;
    severity: string;
    score: number;
    priority: string;
    reasoning: string;
    key_indicators: Record<string, unknown>;
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

async function getAnalysisForPatients(simplIds: string[]): Promise<Record<string, Record<string, AnalysisRow>>> {
    if (simplIds.length === 0) return {};

    const res = await query<AnalysisRow>(
        `SELECT simpl_id, analysis_type, severity, score, priority, reasoning, key_indicators
         FROM analysis_results
         WHERE simpl_id = ANY($1) AND is_current = TRUE`,
        [simplIds]
    );

    const result: Record<string, Record<string, AnalysisRow>> = {};
    for (const row of res.rows) {
        if (!result[row.simpl_id]) result[row.simpl_id] = {};
        result[row.simpl_id][row.analysis_type] = row;
    }
    return result;
}

function severityToNum(s?: string): number {
    switch (s) {
        case 'critical': return 4;
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 0;
    }
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
    }>(
        `SELECT
            p.simpl_id, p.first_name, p.last_name, p.date_of_birth,
            p.patient_status, p.fac_id, p.room, p.bed, p.unit,
            p.admit_date, p.last_synced_at,
            f.name AS facility_name
         FROM patients p
         LEFT JOIN facilities f ON f.fac_id = p.fac_id
         WHERE 1=1
         ${facilityClause}
         ORDER BY
           CASE WHEN (p.patient_status = 'Current' OR p.patient_status IS NULL) THEN 0 ELSE 1 END,
           p.last_name`,
        param
    );

    const simplIds = res.rows.map(r => r.simpl_id);
    const [labsMap, analysisMap] = await Promise.all([
        getLatestLabsForPatients(simplIds),
        getAnalysisForPatients(simplIds),
    ]);

    const now = Date.now();
    const patients = res.rows.map(r => {
        const admitDate = r.admit_date ? new Date(r.admit_date) : null;
        const daysInFacility = admitDate
            ? Math.floor((now - admitDate.getTime()) / 86400000)
            : null;

        const patAnalysis = analysisMap[r.simpl_id] ?? {};
        const dbAnalysis: Record<string, { severity: string; score: number; priority: string; reasoning: string; indicators: Record<string, unknown> } | null> = {};
        for (const t of ANALYSIS_TYPES) {
            const a = patAnalysis[t];
            dbAnalysis[t] = a ? {
                severity: a.severity,
                score: a.score,
                priority: a.priority,
                reasoning: a.reasoning,
                indicators: a.key_indicators,
            } : null;
        }

        const combinedUrgency = Math.max(
            ...ANALYSIS_TYPES.map(t => severityToNum(patAnalysis[t]?.severity)),
            0
        );

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
            db_analysis: dbAnalysis,
            combined_urgency: combinedUrgency,
            data_source: 'live_db',
        };
    });

    // Sort: active first, then by urgency desc, then name
    patients.sort((a, b) => {
        const aActive = (!a.patient_status || a.patient_status === 'Current') ? 0 : 1;
        const bActive = (!b.patient_status || b.patient_status === 'Current') ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        if (b.combined_urgency !== a.combined_urgency) return b.combined_urgency - a.combined_urgency;
        return a.last_name.localeCompare(b.last_name);
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
