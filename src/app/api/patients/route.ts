import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isDbConfigured, query } from '@/lib/db/client';

const INDEX_PATH = path.join(process.cwd(), 'public', 'mockData', 'patients', '_facility_index.json');

let cachedIndex: Record<string, unknown[]> | null = null;
let cachedAt = 0;
let fileModifiedAt: string | null = null;
const CACHE_TTL = 60_000;

function loadIndex(): Record<string, unknown[]> {
    const now = Date.now();
    if (cachedIndex && now - cachedAt < CACHE_TTL) return cachedIndex;
    try {
        const stat = fs.statSync(INDEX_PATH);
        fileModifiedAt = stat.mtime.toISOString();
        cachedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
        cachedAt = now;
        return cachedIndex!;
    } catch {
        return {};
    }
}

async function getPatientsFromDb(facilityFilter?: string) {
    // Match by facility name (partial, case-insensitive) OR fac_id
    const facilityClause = facilityFilter
        ? `AND (LOWER(f.name) LIKE LOWER($1) OR CAST(p.fac_id AS TEXT) = $1)`
        : '';
    const param = facilityFilter ? [`%${facilityFilter}%`] : [];

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
        floor: string;
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
            p.patient_status, p.fac_id, p.room, p.bed, p.unit, p.floor,
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
         WHERE (p.patient_status = 'Current' OR p.patient_status IS NULL)
         ${facilityClause}
         ORDER BY combined_urgency DESC NULLS LAST, p.last_name`,
        param
    );

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

        if (isDbConfigured()) {
            try {
                const dbResult = await getPatientsFromDb(facilityFilter ?? undefined);
                if (dbResult.patients.length > 0) {
                    return NextResponse.json({ ...dbResult, data_source: 'live_db' });
                }
            } catch (dbErr) {
                console.warn('[/api/patients] DB query failed, falling back to local:', dbErr);
            }
        }

        // Fallback: local facility index JSON
        const index = loadIndex();
        const lastRefreshed = fileModifiedAt ?? new Date().toISOString();

        if (facilityFilter) {
            const key = Object.keys(index).find(k =>
                k.trim().toLowerCase().includes(facilityFilter.toLowerCase())
            );
            const patients = key ? index[key] : [];
            return NextResponse.json({ patients, lastRefreshed, data_source: 'local_cache' });
        }

        const patients = Object.values(index).flat();
        return NextResponse.json({ patients, lastRefreshed, data_source: 'local_cache' });
    } catch (error) {
        console.error('[/api/patients] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
