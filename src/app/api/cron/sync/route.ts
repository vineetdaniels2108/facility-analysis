import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, query, withTransaction } from '@/lib/db/client';
import { getPccToken } from '@/lib/api/pcc-token';
import { fetchResource, fetchSummary } from '@/lib/sync/fetch';
import { runAnalysis } from '@/lib/analysis/engine';
import {
    PccDiagnosticReport, PccCondition, PccMedication,
    PccObservation, PccAssessment, PccCarePlan,
    PccProgressNote, PccAdtRecord, PccAllergy,
    PccImmunization, PccCoverage,
} from '@/lib/sync/types';
import { syncLabs } from '@/lib/sync/resources/labs';
import { syncConditions } from '@/lib/sync/resources/conditions';
import { syncMedications } from '@/lib/sync/resources/medications';
import { syncObservations } from '@/lib/sync/resources/observations';
import { syncAssessments } from '@/lib/sync/resources/assessments';
import { syncCarePlans } from '@/lib/sync/resources/careplans';
import { syncProgressNotes } from '@/lib/sync/resources/progressnotes';
import { syncAdtRecords, extractCurrentLocation } from '@/lib/sync/resources/adtrecords';
import { syncAllergies, syncImmunizations, syncCoverages } from '@/lib/sync/resources/allergies';

// Vercel cron calls this with GET, secured by CRON_SECRET header
// vercel.json configures schedule: every 2 hours
export async function GET(req: NextRequest) {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 503 });
    }

    const startTime = Date.now();
    const facIdParam = req.nextUrl.searchParams.get('fac_id');
    const facId = facIdParam ? parseInt(facIdParam) : null;

    // Get all patients from PostgreSQL that need syncing
    // Only re-sync patients whose last_synced_at is null or >2 hours old
    const patientsRes = await query<{ simpl_id: string; first_name: string; last_name: string; fac_id: number }>(
        `SELECT simpl_id, first_name, last_name, fac_id FROM patients
         WHERE (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '2 hours')
         ${facId ? 'AND fac_id = $1' : ''}
         ORDER BY last_synced_at ASC NULLS FIRST
         LIMIT 50`,
        facId ? [facId] : []
    );

    const patients = patientsRes.rows;

    if (patients.length === 0) {
        return NextResponse.json({
            ok: true,
            message: 'All patients are up to date',
            durationMs: Date.now() - startTime,
        });
    }

    const token = await getPccToken();
    if (!token) {
        return NextResponse.json({ error: 'Failed to get PCC auth token' }, { status: 502 });
    }

    const results = { synced: 0, analyzed: 0, errors: 0, skipped: 0 };

    for (const patient of patients) {
        try {
            await syncAndAnalyzePatient(patient.simpl_id, token);
            results.synced++;
            results.analyzed++;
        } catch (err) {
            console.error(`[cron/sync] Failed for ${patient.simpl_id}:`, err);
            results.errors++;
        }
    }

    const totalMs = Date.now() - startTime;
    console.log(`[cron/sync] Done in ${totalMs}ms:`, results);

    return NextResponse.json({
        ok: true,
        processed: patients.length,
        ...results,
        durationMs: totalMs,
        nextBatch: patients.length === 50 ? 'more patients remain' : 'all caught up',
    });
}

async function syncAndAnalyzePatient(simplId: string, token: string) {
    // Fetch summary to know which resources are available
    const available = await fetchSummary(simplId, token);

    await withTransaction(async (client) => {
        // Parallel batch 1: Labs + Conditions + Medications
        const [labs, conditions, medications] = await Promise.all([
            available?.DIAGNOSTICREPORTS
                ? fetchResource<PccDiagnosticReport>(simplId, 'DIAGNOSTICREPORTS', token)
                : null,
            available?.CONDITIONS
                ? fetchResource<PccCondition>(simplId, 'CONDITIONS', token)
                : null,
            available?.MEDICATIONS
                ? fetchResource<PccMedication>(simplId, 'MEDICATIONS', token)
                : null,
        ]);

        if (labs?.length)       await syncLabs(client, simplId, labs);
        if (conditions?.length) await syncConditions(client, simplId, conditions);
        if (medications?.length) await syncMedications(client, simplId, medications);

        // Parallel batch 2: Observations + Assessments + CarePlans
        const [observations, assessments, careplans] = await Promise.all([
            available?.OBSERVATIONS
                ? fetchResource<PccObservation>(simplId, 'OBSERVATIONS', token)
                : null,
            available?.ASSESSMENTS
                ? fetchResource<PccAssessment>(simplId, 'ASSESSMENTS', token)
                : null,
            available?.CAREPLANS
                ? fetchResource<PccCarePlan>(simplId, 'CAREPLANS', token)
                : null,
        ]);

        if (observations?.length) await syncObservations(client, simplId, observations);
        if (assessments?.length)  await syncAssessments(client, simplId, assessments);
        if (careplans?.length)    await syncCarePlans(client, simplId, careplans);

        // Parallel batch 3: Notes + ADT + Allergies + Immunizations + Coverages
        const [notes, adtRecords, allergies, immunizations, coverages] = await Promise.all([
            available?.PROGRESSNOTES
                ? fetchResource<PccProgressNote>(simplId, 'PROGRESSNOTES', token)
                : null,
            available?.ADTRECORD
                ? fetchResource<PccAdtRecord>(simplId, 'ADTRECORD', token)
                : null,
            available?.ALLERGIES
                ? fetchResource<PccAllergy>(simplId, 'ALLERGIES', token)
                : null,
            available?.IMMUNIZATIONS
                ? fetchResource<PccImmunization>(simplId, 'IMMUNIZATIONS', token)
                : null,
            available?.COVERAGES
                ? fetchResource<PccCoverage>(simplId, 'COVERAGES', token)
                : null,
        ]);

        if (notes?.length)         await syncProgressNotes(client, simplId, notes);
        if (allergies?.length)     await syncAllergies(client, simplId, allergies);
        if (immunizations?.length) await syncImmunizations(client, simplId, immunizations);
        if (coverages?.length)     await syncCoverages(client, simplId, coverages);

        if (adtRecords?.length) {
            await syncAdtRecords(client, simplId, adtRecords);
            const loc = extractCurrentLocation(adtRecords);
            await client.query(
                `UPDATE patients SET room=$1, bed=$2, unit=$3, floor=$4,
                    admit_date=COALESCE($5::date, admit_date), updated_at=NOW()
                 WHERE simpl_id=$6`,
                [loc.room, loc.bed, loc.unit, loc.floor, loc.admitDate, simplId]
            );
        }

        await client.query(
            `UPDATE patients SET last_synced_at=NOW() WHERE simpl_id=$1`,
            [simplId]
        );
    });

    // Run analysis after sync
    await runAnalysis(simplId);
}
