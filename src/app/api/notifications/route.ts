import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!isDbConfigured()) return NextResponse.json({ notifications: [] });

    try {
        // New critical/high analysis results from the last 24 hours
        const res = await query<{
            simpl_id: string;
            first_name: string;
            last_name: string;
            fac_name: string;
            analysis_type: string;
            severity: string;
            reasoning: string;
            created_at: string;
        }>(`
            SELECT p.simpl_id, p.first_name, p.last_name,
                   f.name AS fac_name,
                   a.analysis_type, a.severity, a.reasoning,
                   a.created_at::text
            FROM analysis_results a
            JOIN patients p ON p.simpl_id = a.simpl_id
            JOIN facilities f ON f.fac_id = p.fac_id
            WHERE a.is_current = TRUE
              AND a.severity IN ('critical', 'high')
              AND a.analysis_type NOT LIKE 'ai_%'
              AND a.created_at >= NOW() - INTERVAL '24 hours'
              AND (p.patient_status = 'Current' OR p.patient_status IS NULL)
            ORDER BY
                CASE a.severity WHEN 'critical' THEN 1 ELSE 2 END,
                a.created_at DESC
            LIMIT 30
        `);

        const notifications = res.rows.map(r => ({
            id: `${r.simpl_id}-${r.analysis_type}`,
            patientName: `${r.last_name}, ${r.first_name}`,
            facilityName: r.fac_name,
            type: r.analysis_type,
            severity: r.severity,
            message: r.reasoning?.split('.')[0] ?? `${r.severity} ${r.analysis_type} risk detected`,
            time: r.created_at,
        }));

        return NextResponse.json({ notifications, unread: notifications.length });
    } catch (err) {
        console.error('[notifications]', err);
        return NextResponse.json({ notifications: [], unread: 0 });
    }
}
