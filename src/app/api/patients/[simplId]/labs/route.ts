import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

async function getLabsFromDb(simplId: string) {
    const res = await query<{
        observation_name: string;
        value_numeric: number;
        unit: string;
        reference_range: string;
        effective_at: string;
        is_abnormal: boolean;
    }>(
        `SELECT observation_name, value_numeric, unit, reference_range,
                effective_at::text, is_abnormal
         FROM lab_results
         WHERE simpl_id = $1
         ORDER BY observation_name, effective_at DESC`,
        [simplId]
    );

    if (res.rows.length === 0) return { latest: {}, history: {} };

    const history: Record<string, Array<{ date: string; value: number; unit: string; referenceRange: string }>> = {};
    const latest: Record<string, { date: string; value: number; unit: string; referenceRange: string }> = {};

    for (const row of res.rows) {
        const name = row.observation_name;
        const entry = {
            date: row.effective_at,
            value: row.value_numeric,
            unit: row.unit ?? '',
            referenceRange: row.reference_range ?? '',
        };
        if (!history[name]) history[name] = [];
        history[name].push(entry);
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

    if (!isDbConfigured()) {
        return NextResponse.json({ latest: {}, history: {} });
    }

    try {
        const result = await getLabsFromDb(simplId);
        return NextResponse.json(result);
    } catch (err) {
        console.error('[labs] DB error:', err);
        return NextResponse.json({ latest: {}, history: {} });
    }
}
