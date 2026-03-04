import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';
import { getUserProfile } from '@/lib/auth/get-user-facilities';

export async function GET() {
    if (!isDbConfigured()) {
        return NextResponse.json({ facilities: [] });
    }

    try {
        const profile = await getUserProfile();
        const allowedFacIds = profile?.facilityIds?.length ? profile.facilityIds : null;

        let sql = `SELECT f.fac_id, f.name,
                    COUNT(p.simpl_id) FILTER (WHERE p.patient_status = 'Current' OR p.patient_status IS NULL)::int AS active_count
             FROM facilities f
             LEFT JOIN patients p ON p.fac_id = f.fac_id`;

        const params: unknown[] = [];
        if (allowedFacIds && allowedFacIds.length > 0) {
            sql += ` WHERE f.fac_id = ANY($1)`;
            params.push(allowedFacIds);
        }

        sql += ` GROUP BY f.fac_id, f.name
                 HAVING COUNT(p.simpl_id) > 0
                 ORDER BY f.name`;

        const res = await query<{ fac_id: number; name: string; active_count: number }>(sql, params);

        const facilities = res.rows.map(r => ({
            fac_id: r.fac_id,
            name: r.name,
            active_count: r.active_count,
        }));

        return NextResponse.json({ facilities });
    } catch (error) {
        console.error('[/api/facilities] DB error:', error);
        return NextResponse.json({ facilities: [] });
    }
}
