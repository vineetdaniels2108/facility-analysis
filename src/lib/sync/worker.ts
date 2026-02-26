import { withTransaction } from '@/lib/db/client';
import { getPccToken } from '@/lib/api/pcc-token';
import { fetchResource, fetchSummary } from './fetch';
import { syncLabs } from './resources/labs';
import { syncConditions } from './resources/conditions';
import { syncMedications } from './resources/medications';
import { syncObservations } from './resources/observations';
import { syncAssessments } from './resources/assessments';
import { syncCarePlans } from './resources/careplans';
import { syncProgressNotes } from './resources/progressnotes';
import { syncAdtRecords, extractCurrentLocation } from './resources/adtrecords';
import { syncAllergies, syncImmunizations, syncCoverages } from './resources/allergies';
import {
    PccDiagnosticReport, PccCondition, PccMedication, PccObservation,
    PccAssessment, PccCarePlan, PccProgressNote, PccAdtRecord,
    PccAllergy, PccImmunization, PccCoverage, SyncResult,
} from './types';
import { runAnalysis } from '@/lib/analysis/engine';

export interface PatientSyncInput {
    simplId: string;
    firstName?: string;
    lastName?: string;
    facId?: number;
}

export interface SyncReport {
    simplId: string;
    status: 'success' | 'partial' | 'error';
    resources: SyncResult[];
    totalSynced: number;
    totalErrors: number;
    durationMs: number;
}

const ALL_RESOURCES = [
    'DIAGNOSTICREPORTS', 'CONDITIONS', 'MEDICATIONS', 'OBSERVATIONS',
    'ASSESSMENTS', 'CAREPLANS', 'PROGRESSNOTES', 'ADTRECORD',
    'ALLERGIES', 'IMMUNIZATIONS', 'COVERAGES',
] as const;

export async function syncPatient(patient: PatientSyncInput): Promise<SyncReport> {
    const start = Date.now();
    const results: SyncResult[] = [];

    const token = await getPccToken();
    if (!token) {
        return {
            simplId: patient.simplId,
            status: 'error',
            resources: [],
            totalSynced: 0,
            totalErrors: 1,
            durationMs: Date.now() - start,
        };
    }

    // Ensure patient row exists
    await withTransaction(async (client) => {
        await client.query(
            `INSERT INTO patients (simpl_id, first_name, last_name, fac_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (simpl_id) DO UPDATE SET
                first_name = COALESCE(EXCLUDED.first_name, patients.first_name),
                last_name  = COALESCE(EXCLUDED.last_name, patients.last_name),
                updated_at = NOW()`,
            [patient.simplId, patient.firstName, patient.lastName, patient.facId]
        );
    });

    // Check which resources this patient actually has
    const availableResources = await fetchSummary(patient.simplId, token);

    // Sync each resource in parallel batches
    await withTransaction(async (client) => {
        // Batch 1: Labs + Conditions + Medications (core clinical data)
        const [labs, conditions, medications] = await Promise.all([
            availableResources?.DIAGNOSTICREPORTS
                ? fetchResource<PccDiagnosticReport>(patient.simplId, 'DIAGNOSTICREPORTS', token)
                : Promise.resolve(null),
            availableResources?.CONDITIONS
                ? fetchResource<PccCondition>(patient.simplId, 'CONDITIONS', token)
                : Promise.resolve(null),
            availableResources?.MEDICATIONS
                ? fetchResource<PccMedication>(patient.simplId, 'MEDICATIONS', token)
                : Promise.resolve(null),
        ]);

        if (labs?.length) results.push(await syncLabs(client, patient.simplId, labs));
        if (conditions?.length) results.push(await syncConditions(client, patient.simplId, conditions));
        if (medications?.length) results.push(await syncMedications(client, patient.simplId, medications));

        // Batch 2: Observations + Assessments + CarePlans
        const [observations, assessments, careplans] = await Promise.all([
            availableResources?.OBSERVATIONS
                ? fetchResource<PccObservation>(patient.simplId, 'OBSERVATIONS', token)
                : Promise.resolve(null),
            availableResources?.ASSESSMENTS
                ? fetchResource<PccAssessment>(patient.simplId, 'ASSESSMENTS', token)
                : Promise.resolve(null),
            availableResources?.CAREPLANS
                ? fetchResource<PccCarePlan>(patient.simplId, 'CAREPLANS', token)
                : Promise.resolve(null),
        ]);

        if (observations?.length) results.push(await syncObservations(client, patient.simplId, observations));
        if (assessments?.length) results.push(await syncAssessments(client, patient.simplId, assessments));
        if (careplans?.length) results.push(await syncCarePlans(client, patient.simplId, careplans));

        // Batch 3: Notes + ADT + Allergies + Immunizations + Coverages
        const [notes, adtRecords, allergies, immunizations, coverages] = await Promise.all([
            availableResources?.PROGRESSNOTES
                ? fetchResource<PccProgressNote>(patient.simplId, 'PROGRESSNOTES', token)
                : Promise.resolve(null),
            availableResources?.ADTRECORD
                ? fetchResource<PccAdtRecord>(patient.simplId, 'ADTRECORD', token)
                : Promise.resolve(null),
            availableResources?.ALLERGIES
                ? fetchResource<PccAllergy>(patient.simplId, 'ALLERGIES', token)
                : Promise.resolve(null),
            availableResources?.IMMUNIZATIONS
                ? fetchResource<PccImmunization>(patient.simplId, 'IMMUNIZATIONS', token)
                : Promise.resolve(null),
            availableResources?.COVERAGES
                ? fetchResource<PccCoverage>(patient.simplId, 'COVERAGES', token)
                : Promise.resolve(null),
        ]);

        if (notes?.length) results.push(await syncProgressNotes(client, patient.simplId, notes));
        if (adtRecords?.length) {
            results.push(await syncAdtRecords(client, patient.simplId, adtRecords));
            const location = extractCurrentLocation(adtRecords);
            await client.query(
                `UPDATE patients SET room=$1, bed=$2, unit=$3, floor=$4,
                    admit_date=COALESCE($5::date, admit_date), updated_at=NOW()
                 WHERE simpl_id=$6`,
                [location.room, location.bed, location.unit, location.floor, location.admitDate, patient.simplId]
            );
        }
        if (allergies?.length) results.push(await syncAllergies(client, patient.simplId, allergies));
        if (immunizations?.length) results.push(await syncImmunizations(client, patient.simplId, immunizations));
        if (coverages?.length) results.push(await syncCoverages(client, patient.simplId, coverages));

        // Mark patient as synced
        await client.query(
            `UPDATE patients SET last_synced_at=NOW() WHERE simpl_id=$1`,
            [patient.simplId]
        );

        // Log sync
        for (const r of results) {
            await client.query(
                `INSERT INTO sync_log (simpl_id, resource_type, records_synced, status, completed_at)
                 VALUES ($1,$2,$3,$4,NOW())`,
                [patient.simplId, r.resource, r.synced, r.errors > 0 ? 'partial' : 'success']
            );
        }
    });

    // Run analysis after sync (non-blocking failure)
    try {
        await runAnalysis(patient.simplId);
    } catch (err) {
        console.error(`[sync] analysis failed for ${patient.simplId}:`, err);
    }

    const totalSynced = results.reduce((s, r) => s + r.synced, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors, 0);

    return {
        simplId: patient.simplId,
        status: totalErrors > 0 ? 'partial' : 'success',
        resources: results,
        totalSynced,
        totalErrors,
        durationMs: Date.now() - start,
    };
}

export async function syncFacility(
    patients: PatientSyncInput[],
    options: { concurrency?: number } = {}
): Promise<{ reports: SyncReport[]; totalMs: number }> {
    const start = Date.now();
    const concurrency = options.concurrency ?? 5;
    const reports: SyncReport[] = [];

    // Process patients in batches to avoid overwhelming the PCC API
    for (let i = 0; i < patients.length; i += concurrency) {
        const batch = patients.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(batch.map(p => syncPatient(p)));

        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                reports.push(result.value);
            } else {
                console.error('[sync] Patient sync rejected:', result.reason);
            }
        }

        console.log(`[sync] Facility progress: ${Math.min(i + concurrency, patients.length)}/${patients.length}`);
    }

    return { reports, totalMs: Date.now() - start };
}
