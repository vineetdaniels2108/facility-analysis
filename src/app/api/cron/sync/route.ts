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

export const maxDuration = 300; // 5 min (Vercel Pro)

// Runs daily at 3am UTC via vercel.json cron.
// Syncs ALL active facilities. Processes patients in staleness order,
// fitting as many as possible within the function timeout.

const MAX_PATIENTS_PER_RUN = 50; // stay well within timeout
const STALE_THRESHOLD_HOURS = 20;

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 503 });
    }

    const startTime = Date.now();
    const token = await getPccToken();
    if (!token) {
        return NextResponse.json({ error: 'Failed to get PCC auth token' }, { status: 502 });
    }

    // Get ALL patients across all facilities, ordered by staleness (never-synced first)
    const patientsRes = await query<{
        simpl_id: string;
        first_name: string;
        last_name: string;
        fac_id: number;
        patient_status: string;
        last_synced_at: Date | null;
    }>(
        `SELECT simpl_id, first_name, last_name, fac_id, patient_status, last_synced_at
         FROM patients
         WHERE (patient_status = 'Current' OR patient_status IS NULL)
         ORDER BY last_synced_at ASC NULLS FIRST
         LIMIT $1`,
        [MAX_PATIENTS_PER_RUN]
    );

    const patients = patientsRes.rows;
    if (patients.length === 0) {
        return NextResponse.json({ ok: true, message: 'No patients to sync' });
    }

    const results = { checked: 0, synced: 0, skipped: 0, errors: 0, facilities: new Set<number>() };

    for (const patient of patients) {
        // Stop if we're approaching the timeout (leave 30s buffer)
        if (Date.now() - startTime > 250_000) break;

        results.checked++;
        results.facilities.add(patient.fac_id);

        try {
            // Skip recently synced patients
            if (patient.last_synced_at) {
                const hoursSinceSync = (Date.now() - new Date(patient.last_synced_at).getTime()) / 36e5;
                if (hoursSinceSync < STALE_THRESHOLD_HOURS) {
                    results.skipped++;
                    continue;
                }
            }

            const summary = await fetchSummary(patient.simpl_id, token);
            if (!summary || Object.keys(summary).length === 0) {
                results.skipped++;
                continue;
            }

            await syncAndAnalyzePatient(patient.simpl_id, summary, token);
            results.synced++;
        } catch (err) {
            console.error(`[cron] Failed for ${patient.simpl_id} (${patient.first_name} ${patient.last_name}):`, err);
            results.errors++;
        }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[cron/sync] Complete in ${Math.round(durationMs / 1000)}s:`, {
        ...results,
        facilities: results.facilities.size,
    });

    return NextResponse.json({
        ok: true,
        facilitiesProcessed: results.facilities.size,
        patients: patients.length,
        checked: results.checked,
        synced: results.synced,
        skipped: results.skipped,
        errors: results.errors,
        durationMs,
    });
}

async function syncAndAnalyzePatient(
    simplId: string,
    available: Record<string, number>,
    token: string
) {
    await withTransaction(async (client) => {
        // Batch 1: Labs + Conditions + Medications
        const [labs, conditions, medications] = await Promise.all([
            available.DIAGNOSTICREPORTS
                ? fetchResource<PccDiagnosticReport>(simplId, 'DIAGNOSTICREPORTS', token)
                : null,
            available.CONDITIONS
                ? fetchResource<PccCondition>(simplId, 'CONDITIONS', token)
                : null,
            available.MEDICATIONS
                ? fetchResource<PccMedication>(simplId, 'MEDICATIONS', token)
                : null,
        ]);

        if (labs?.length)        await syncLabs(client, simplId, labs);
        if (conditions?.length)  await syncConditions(client, simplId, conditions);
        if (medications?.length) await syncMedications(client, simplId, medications);

        // Batch 2: Observations + Assessments + CarePlans
        const [observations, assessments, careplans] = await Promise.all([
            available.OBSERVATIONS
                ? fetchResource<PccObservation>(simplId, 'OBSERVATIONS', token)
                : null,
            available.ASSESSMENTS
                ? fetchResource<PccAssessment>(simplId, 'ASSESSMENTS', token)
                : null,
            available.CAREPLANS
                ? fetchResource<PccCarePlan>(simplId, 'CAREPLANS', token)
                : null,
        ]);

        if (observations?.length) await syncObservations(client, simplId, observations);
        if (assessments?.length)  await syncAssessments(client, simplId, assessments);
        if (careplans?.length)    await syncCarePlans(client, simplId, careplans);

        // Batch 3: Notes + ADT + Allergies + Immunizations + Coverages
        const [notes, adtRecords, allergies, immunizations, coverages] = await Promise.all([
            available.PROGRESSNOTES
                ? fetchResource<PccProgressNote>(simplId, 'PROGRESSNOTES', token)
                : null,
            available.ADTRECORD
                ? fetchResource<PccAdtRecord>(simplId, 'ADTRECORD', token)
                : null,
            available.ALLERGIES
                ? fetchResource<PccAllergy>(simplId, 'ALLERGIES', token)
                : null,
            available.IMMUNIZATIONS
                ? fetchResource<PccImmunization>(simplId, 'IMMUNIZATIONS', token)
                : null,
            available.COVERAGES
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
            `UPDATE patients SET last_synced_at = NOW() WHERE simpl_id = $1`,
            [simplId]
        );
    });

    await runAnalysis(simplId);
}
