import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

export async function GET() {
    if (!isDbConfigured()) {
        return NextResponse.json({ facilities: [] });
    }

    try {
        const res = await query<{ fac_id: number; name: string; patient_count: number }>(
            `SELECT f.fac_id, f.name,
                    COUNT(p.simpl_id) FILTER (WHERE p.patient_status = 'Current' OR p.patient_status IS NULL)::int AS patient_count
             FROM facilities f
             LEFT JOIN patients p ON p.fac_id = f.fac_id
             GROUP BY f.fac_id, f.name
             HAVING COUNT(p.simpl_id) > 0
             ORDER BY f.name`
        );

        const facilities = res.rows.map(r => ({
            fac_id: r.fac_id,
            name: r.name,
            patient_count: r.patient_count,
        }));

        return NextResponse.json({ facilities });
    } catch (error) {
        console.error('[/api/facilities] DB error:', error);
        return NextResponse.json({ facilities: [] });
    }
}
