import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sync-patients
 * 
 * Accepts a JSON array of patient records and upserts them into the patients table.
 * This endpoint is the gateway for new patient discovery — call it from any source
 * that has access to the patient roster (MySQL BI database, PCC webhook, manual upload).
 * 
 * Body: { patients: [{ simpl_id, fac_id, first_name, last_name, date_of_birth?, 
 *          patient_status?, room?, bed?, unit?, admit_date?, gender? }] }
 * 
 * Once patients are in the table, the cron automatically syncs their clinical data
 * and runs analysis — no further manual steps needed.
 */
export async function POST(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (secret && auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 503 });
    }

    const body = await req.json();
    const patients = body.patients;
    if (!Array.isArray(patients) || patients.length === 0) {
        return NextResponse.json({ error: 'patients array required' }, { status: 400 });
    }

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const p of patients) {
        if (!p.simpl_id || !p.fac_id) { errors++; continue; }

        try {
            // Ensure facility exists
            await query(
                `INSERT INTO facilities (fac_id, name) VALUES ($1, $2) ON CONFLICT (fac_id) DO NOTHING`,
                [p.fac_id, p.facility_name ?? `Facility ${p.fac_id}`]
            );

            const res = await query(
                `INSERT INTO patients (simpl_id, fac_id, first_name, last_name, date_of_birth,
                    patient_status, room, bed, unit, admit_date, gender)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (simpl_id) DO UPDATE SET
                    fac_id          = EXCLUDED.fac_id,
                    first_name      = COALESCE(EXCLUDED.first_name, patients.first_name),
                    last_name       = COALESCE(EXCLUDED.last_name, patients.last_name),
                    date_of_birth   = COALESCE(EXCLUDED.date_of_birth, patients.date_of_birth),
                    patient_status  = COALESCE(EXCLUDED.patient_status, patients.patient_status),
                    room            = COALESCE(EXCLUDED.room, patients.room),
                    bed             = COALESCE(EXCLUDED.bed, patients.bed),
                    unit            = COALESCE(EXCLUDED.unit, patients.unit),
                    admit_date      = COALESCE(EXCLUDED.admit_date, patients.admit_date),
                    gender          = COALESCE(EXCLUDED.gender, patients.gender),
                    updated_at      = NOW()
                 RETURNING (xmax = 0) AS is_insert`,
                [
                    p.simpl_id, p.fac_id,
                    p.first_name ?? null, p.last_name ?? null,
                    p.date_of_birth ?? null, p.patient_status ?? 'Current',
                    p.room ?? null, p.bed ?? null, p.unit ?? null,
                    p.admit_date ?? null, p.gender ?? null,
                ]
            );

            if (res.rows[0]?.is_insert) inserted++;
            else updated++;
        } catch (err) {
            console.error(`[sync-patients] Error for ${p.simpl_id}:`, err);
            errors++;
        }
    }

    return NextResponse.json({
        ok: true,
        total: patients.length,
        inserted,
        updated,
        errors,
        message: inserted > 0
            ? `${inserted} new patients added — they will be synced automatically on the next cron run.`
            : 'All patients already exist, records updated.',
    });
}
