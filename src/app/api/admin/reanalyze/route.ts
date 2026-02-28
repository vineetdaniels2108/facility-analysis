import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';
import { runAnalysis } from '@/lib/analysis/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (secret && auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 503 });
    }

    const facId = parseInt(req.nextUrl.searchParams.get('facId') ?? '121');
    const start = Date.now();

    const patientsRes = await query<{ simpl_id: string; first_name: string; last_name: string }>(
        `SELECT p.simpl_id, p.first_name, p.last_name
         FROM patients p
         WHERE p.fac_id = $1
         AND EXISTS (SELECT 1 FROM lab_results l WHERE l.simpl_id = p.simpl_id)`,
        [facId]
    );

    const patients = patientsRes.rows;
    let completed = 0;
    let errors = 0;

    for (const p of patients) {
        try {
            await runAnalysis(p.simpl_id);
            completed++;
        } catch (err) {
            console.error(`[reanalyze] Failed ${p.first_name} ${p.last_name}:`, err);
            errors++;
        }
    }

    return NextResponse.json({
        ok: true,
        facId,
        total: patients.length,
        completed,
        errors,
        durationMs: Date.now() - start,
    });
}
