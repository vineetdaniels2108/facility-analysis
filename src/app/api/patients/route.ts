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
    const res = await query<{
        simpl_id: string; first_name: string; last_name: string;
        date_of_birth: string; room: string; bed: string; unit: string;
        admit_date: string; last_synced_at: string; fac_id: number;
        infusion_severity: string; infusion_score: number; infusion_priority: string; infusion_reasoning: string; infusion_indicators: Record<string, unknown>;
        transfusion_severity: string; transfusion_score: number; transfusion_priority: string; transfusion_reasoning: string; transfusion_indicators: Record<string, unknown>;
        foley_risk_score: number; foley_risk_reasoning: string;
        gtube_risk_score: number; gtube_risk_reasoning: string;
        mtn_risk_score: number; mtn_risk_reasoning: string;
        combined_urgency: number;
    }>(
        `SELECT v.*
         FROM v_patient_status v
         JOIN patients p ON p.simpl_id = v.simpl_id
         ${facilityFilter ? 'JOIN facilities f ON f.fac_id = p.fac_id WHERE LOWER(f.name) = LOWER($1)' : ''}
         ORDER BY v.combined_urgency DESC, v.last_name`,
        facilityFilter ? [facilityFilter] : []
    );

    const lastRefreshed = res.rows[0]?.last_synced_at ?? new Date().toISOString();

    const patients = res.rows.map(r => ({
        simpl_id: r.simpl_id,
        first_name: r.first_name,
        last_name: r.last_name,
        date_of_birth: r.date_of_birth,
        room: r.room,
        bed: r.bed,
        unit: r.unit,
        admit_date: r.admit_date,
        fac_id: r.fac_id,
        last_synced_at: r.last_synced_at,
        analysis: {
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
            foley_risk: r.foley_risk_score != null ? { score: r.foley_risk_score, reasoning: r.foley_risk_reasoning } : null,
            gtube_risk: r.gtube_risk_score != null ? { score: r.gtube_risk_score, reasoning: r.gtube_risk_reasoning } : null,
            mtn_risk: r.mtn_risk_score != null ? { score: r.mtn_risk_score, reasoning: r.mtn_risk_reasoning } : null,
        },
        combined_urgency: r.combined_urgency,
        data_source: 'live_db',
    }));

    return { patients, lastRefreshed };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const facilityFilter = searchParams.get('facility')?.trim();

        // Use DB if configured (live data with pre-computed analysis)
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
            const key = Object.keys(index).find(k => k.trim().toLowerCase() === facilityFilter.toLowerCase());
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
