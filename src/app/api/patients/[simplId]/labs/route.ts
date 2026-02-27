import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isDbConfigured, query } from '@/lib/db/client';

const PATIENTS_DIR = path.join(process.cwd(), 'public', 'mockData', 'patients');

let historyCache: Record<string, Record<string, unknown>> | null = null;

function loadHistoryIndex(): Record<string, Record<string, unknown>> {
    if (historyCache) return historyCache;
    const filePath = path.join(PATIENTS_DIR, '_labs_history.json');
    try {
        if (fs.existsSync(filePath)) {
            historyCache = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            return historyCache!;
        }
    } catch { /* skip */ }
    return {};
}

function safeReadJson(filePath: string): unknown {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* skip */ }
    return {};
}

async function getLabsFromDb(simplId: string) {
    // Get all lab readings grouped by lab name — for history/trends
    const histRes = await query<{
        observation_name: string;
        value_numeric: number;
        unit: string;
        reference_range: string;
        effective_at: string;
        is_abnormal: boolean;
        is_critical: boolean;
    }>(
        `SELECT observation_name, value_numeric, unit, reference_range,
                effective_at::text, is_abnormal, is_critical
         FROM lab_results
         WHERE simpl_id = $1
         ORDER BY observation_name, effective_at DESC`,
        [simplId]
    );

    if (histRes.rows.length === 0) return null;

    // Build history map: { "Hemoglobin": [{date, value, unit, referenceRange}, ...] }
    const history: Record<string, Array<{ date: string; value: number; unit: string; referenceRange: string }>> = {};
    const latest: Record<string, { date: string; value: number; unit: string; referenceRange: string }> = {};

    for (const row of histRes.rows) {
        const name = row.observation_name;
        const entry = {
            date: row.effective_at,
            value: row.value_numeric,
            unit: row.unit ?? '',
            referenceRange: row.reference_range ?? '',
        };
        if (!history[name]) history[name] = [];
        history[name].push(entry);
        // First row per name = most recent (ordered DESC)
        if (!latest[name]) latest[name] = entry;
    }

    return { latest, history };
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ simplId: string }> }
) {
    const { simplId } = await params;

    if (!/^[a-f0-9-]{36}$/.test(simplId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    // Try DB first
    if (isDbConfigured()) {
        try {
            const dbResult = await getLabsFromDb(simplId);
            if (dbResult) {
                return NextResponse.json(dbResult);
            }
        } catch (err) {
            console.warn('[labs] DB query failed, falling back to local files:', err);
        }
    }

    // Fallback: local JSON files
    const latest = safeReadJson(path.join(PATIENTS_DIR, simplId, 'labs_latest.json'));
    const historyIndex = loadHistoryIndex();
    const history = historyIndex[simplId] ?? safeReadJson(path.join(PATIENTS_DIR, simplId, 'labs_history.json'));

    return NextResponse.json({ latest, history });
}
