import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
    const configured = isDbConfigured();

    if (!configured) {
        return NextResponse.json({
            ok: false,
            error: 'DATABASE_URL is not set in environment variables',
            configured: false,
        }, { status: 503 });
    }

    try {
        const t0 = Date.now();
        const res = await query<{ now: string; patient_count: number; analysis_count: number }>(
            `SELECT NOW()::text AS now,
                    (SELECT COUNT(*) FROM patients WHERE fac_id=121)::int AS patient_count,
                    (SELECT COUNT(*) FROM analysis_results WHERE is_current=TRUE)::int AS analysis_count`
        );
        const latencyMs = Date.now() - t0;
        const row = res.rows[0];

        return NextResponse.json({
            ok: true,
            configured: true,
            latencyMs,
            dbTime: row.now,
            baywoodPatients: row.patient_count,
            analysisResults: row.analysis_count,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({
            ok: false,
            configured: true,
            error: message,
        }, { status: 502 });
    }
}
