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

// Runs once daily at 3am UTC (vercel.json schedule: "0 3 * * *")
// Scoped to Baywood (fac_id=121) for now.
// Only syncs patients whose PCC summary shows data newer than our last sync.

const BAYWOOD_FAC_ID = 121;

export async function GET(req: NextRequest) {
    // Vercel Cron automatically sends Authorization: Bearer <CRON_SECRET>
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 503 });
    }

    const startTime = Date.now();

    // Get all Baywood patients from PostgreSQL
    const patientsRes = await query<{
        simpl_id: string;
        first_name: string;
        last_name: string;
        last_synced_at: Date | null;
    }>(
        `SELECT simpl_id, first_name, last_name, last_synced_at
         FROM patients
         WHERE fac_id = $1
         ORDER BY last_synced_at ASC NULLS FIRST`,
        [BAYWOOD_FAC_ID]
    );

    const patients = patientsRes.rows;
    if (patients.length === 0) {
        return NextResponse.json({ ok: true, message: 'No Baywood patients found' });
    }

    const token = await getPccToken();
    if (!token) {
        return NextResponse.json({ error: 'Failed to get PCC auth token' }, { status: 502 });
    }

    const results = { checked: 0, synced: 0, skipped: 0, errors: 0 };

    for (const patient of patients) {
        results.checked++;
        try {
            // Fetch PCC summary — this tells us what resources exist and their counts.
            // We use it as a lightweight "has anything changed?" check before doing
            // the full sync. If PCC has no data for this patient we skip them.
            const summary = await fetchSummary(patient.simpl_id, token);

            if (!summary || Object.keys(summary).length === 0) {
                results.skipped++;
                continue;
            }

            // If patient was synced in the last 20 hours, skip unless never synced
            if (patient.last_synced_at) {
                const hoursSinceSync = (Date.now() - new Date(patient.last_synced_at).getTime()) / 36e5;
                if (hoursSinceSync < 20) {
                    results.skipped++;
                    continue;
                }
            }

            await syncAndAnalyzePatient(patient.simpl_id, summary, token);
            results.synced++;
        } catch (err) {
            console.error(`[cron] Failed for ${patient.simpl_id} (${patient.first_name} ${patient.last_name}):`, err);
            results.errors++;
        }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[cron/sync] Baywood complete in ${Math.round(durationMs / 1000)}s:`, results);

    return NextResponse.json({
        ok: true,
        facility: 'Baywood',
        fac_id: BAYWOOD_FAC_ID,
        patients: patients.length,
        ...results,
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

    // Run all analysis modules — results written to analysis_results table
    await runAnalysis(simplId);
}
