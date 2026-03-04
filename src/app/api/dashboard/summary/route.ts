import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';
import { getUserProfile } from '@/lib/auth/get-user-facilities';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!isDbConfigured()) return NextResponse.json({ facilities: [], urgent: [] });

    try {
        const profile = await getUserProfile();
        const allowedFacIds = profile?.facilityIds?.length ? profile.facilityIds : null;

        const facParams: unknown[] = [];
        let facWhereClause = '';
        let urgentFacClause = '';

        if (allowedFacIds) {
            facWhereClause = `AND f.fac_id = ANY($1)`;
            urgentFacClause = `AND f.fac_id = ANY($1)`;
            facParams.push(allowedFacIds);
        }

        const facRes = await query<{
            fac_id: number; name: string; active_count: number;
            critical: number; high: number;
            infusion_count: number; transfusion_count: number;
            foley_count: number; gtube_count: number; mtn_count: number;
        }>(`
            SELECT
                f.fac_id, f.name,
                COUNT(p.simpl_id) FILTER (WHERE p.patient_status = 'Current' OR p.patient_status IS NULL)::int AS active_count,
                COUNT(*) FILTER (WHERE ar_top.max_sev = 'critical' AND (p.patient_status = 'Current' OR p.patient_status IS NULL))::int AS critical,
                COUNT(*) FILTER (WHERE ar_top.max_sev = 'high'     AND (p.patient_status = 'Current' OR p.patient_status IS NULL))::int AS high,
                COUNT(*) FILTER (WHERE ar_inf.severity IN ('critical','high') AND (p.patient_status = 'Current' OR p.patient_status IS NULL))::int AS infusion_count,
                COUNT(*) FILTER (WHERE ar_tra.severity IN ('critical','high') AND (p.patient_status = 'Current' OR p.patient_status IS NULL))::int AS transfusion_count,
                COUNT(*) FILTER (WHERE ar_fol.severity IN ('critical','high') AND (p.patient_status = 'Current' OR p.patient_status IS NULL))::int AS foley_count,
                COUNT(*) FILTER (WHERE ar_gtu.severity IN ('critical','high') AND (p.patient_status = 'Current' OR p.patient_status IS NULL))::int AS gtube_count,
                COUNT(*) FILTER (WHERE ar_mtn.severity IN ('critical','high') AND (p.patient_status = 'Current' OR p.patient_status IS NULL))::int AS mtn_count
            FROM facilities f
            LEFT JOIN patients p ON p.fac_id = f.fac_id
            LEFT JOIN LATERAL (
                SELECT CASE MAX(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END)
                    WHEN 4 THEN 'critical' WHEN 3 THEN 'high' WHEN 2 THEN 'medium' WHEN 1 THEN 'low' ELSE 'normal' END AS max_sev
                FROM analysis_results WHERE simpl_id = p.simpl_id AND is_current = TRUE AND analysis_type NOT LIKE 'ai_%'
            ) ar_top ON TRUE
            LEFT JOIN analysis_results ar_inf ON ar_inf.simpl_id = p.simpl_id AND ar_inf.analysis_type = 'infusion'    AND ar_inf.is_current = TRUE
            LEFT JOIN analysis_results ar_tra ON ar_tra.simpl_id = p.simpl_id AND ar_tra.analysis_type = 'transfusion' AND ar_tra.is_current = TRUE
            LEFT JOIN analysis_results ar_fol ON ar_fol.simpl_id = p.simpl_id AND ar_fol.analysis_type = 'foley_risk'  AND ar_fol.is_current = TRUE
            LEFT JOIN analysis_results ar_gtu ON ar_gtu.simpl_id = p.simpl_id AND ar_gtu.analysis_type = 'gtube_risk'  AND ar_gtu.is_current = TRUE
            LEFT JOIN analysis_results ar_mtn ON ar_mtn.simpl_id = p.simpl_id AND ar_mtn.analysis_type = 'mtn_risk'    AND ar_mtn.is_current = TRUE
            WHERE 1=1 ${facWhereClause}
            GROUP BY f.fac_id, f.name
            HAVING COUNT(p.simpl_id) > 0
            ORDER BY critical DESC, high DESC, f.name
        `, facParams);

        const urgentRes = await query<{
            simpl_id: string; first_name: string; last_name: string;
            room: string; fac_name: string; fac_id: number;
            max_sev: string; flags: string;
            hgb: number; alb: number; last_lab_date: string;
        }>(`
            SELECT
                p.simpl_id, p.first_name, p.last_name, p.room,
                f.name AS fac_name, f.fac_id,
                CASE MAX(CASE a.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 ELSE 0 END)
                    WHEN 4 THEN 'critical' WHEN 3 THEN 'high' ELSE 'high' END AS max_sev,
                STRING_AGG(DISTINCT a.analysis_type, ',' ORDER BY a.analysis_type) AS flags,
                (SELECT value_numeric::float FROM lab_results WHERE simpl_id = p.simpl_id AND observation_name = 'HGB' AND value_numeric IS NOT NULL ORDER BY effective_at DESC LIMIT 1) AS hgb,
                (SELECT value_numeric::float FROM lab_results WHERE simpl_id = p.simpl_id AND observation_name = 'ALB' AND value_numeric IS NOT NULL ORDER BY effective_at DESC LIMIT 1) AS alb,
                (SELECT MAX(effective_at)::text FROM lab_results WHERE simpl_id = p.simpl_id AND value_numeric IS NOT NULL) AS last_lab_date
            FROM patients p
            JOIN facilities f ON f.fac_id = p.fac_id
            JOIN analysis_results a ON a.simpl_id = p.simpl_id AND a.is_current = TRUE
                AND a.severity IN ('critical', 'high') AND a.analysis_type NOT LIKE 'ai_%'
            WHERE (p.patient_status = 'Current' OR p.patient_status IS NULL)
            ${urgentFacClause}
            GROUP BY p.simpl_id, p.first_name, p.last_name, p.room, f.name, f.fac_id
            ORDER BY MAX(CASE a.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 ELSE 0 END) DESC,
                     MAX(a.score) DESC
        `, facParams);

        return NextResponse.json({
            facilities: facRes.rows,
            urgent: urgentRes.rows,
        });
    } catch (err) {
        console.error('[dashboard/summary]', err);
        return NextResponse.json({ facilities: [], urgent: [] });
    }
}
