import { PoolClient } from 'pg';
import { PccAllergy, PccImmunization, PccCoverage, SyncResult } from '../types';

export async function syncAllergies(
    client: PoolClient,
    simplId: string,
    allergies: PccAllergy[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const a of allergies) {
        try {
            const code = a.allergenCode?.codings?.[0];
            const isSnomed = code?.system?.includes('snomed');
            const isRxNorm = code?.system?.includes('rxnorm') || code?.system?.includes('RxNorm');

            await client.query(
                `INSERT INTO allergies
                    (simpl_id, allergy_id, allergen, allergen_snomed, allergen_rxnorm,
                     category, allergy_type, clinical_status, severity, onset_date,
                     created_by, allergy_created_at, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                 ON CONFLICT (simpl_id, allergy_id) DO UPDATE SET
                    clinical_status  = EXCLUDED.clinical_status,
                    severity         = EXCLUDED.severity,
                    synced_at        = NOW()`,
                [
                    simplId,
                    a.allergyIntoleranceId,
                    a.allergen,
                    isSnomed ? code?.code : null,
                    isRxNorm ? code?.code : null,
                    a.category,
                    a.type,
                    a.clinicalStatus,
                    a.severity,
                    a.onsetDate ?? null,
                    a.createdBy,
                    a.createdDate ?? null,
                    JSON.stringify(a),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/allergies] error for ${a.allergyIntoleranceId}:`, err);
            errors++;
        }
    }

    return { resource: 'ALLERGIES', synced, skipped: 0, errors, durationMs: Date.now() - start };
}

export async function syncImmunizations(
    client: PoolClient,
    simplId: string,
    immunizations: PccImmunization[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const imm of immunizations) {
        try {
            await client.query(
                `INSERT INTO immunizations
                    (simpl_id, immunization_id, name, cvx_code, cvx_description,
                     consent_status, was_given, administered_at, route, location_given,
                     dose_value, dose_unit, manufacturer, lot_number, expiration_date,
                     administered_by, reason_refused, results, created_at, created_by, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
                 ON CONFLICT (simpl_id, immunization_id) DO UPDATE SET
                    was_given        = EXCLUDED.was_given,
                    results          = EXCLUDED.results,
                    synced_at        = NOW()`,
                [
                    simplId,
                    imm.immunizationId,
                    imm.immunization,
                    imm.cvxCode,
                    imm.cvxDescription,
                    imm.consentStatus,
                    imm.given ?? false,
                    imm.administrationDateTime ?? null,
                    imm.routeOfAdministration,
                    imm.locationGiven,
                    imm.amountAdministered?.value ?? null,
                    imm.amountAdministered?.unit,
                    imm.manufacturerName,
                    imm.lotNumber,
                    imm.substanceExpirationDate ?? null,
                    imm.administeredBy,
                    imm.reasonRefused,
                    imm.results,
                    imm.createdDateTime ?? null,
                    imm.createdBy,
                    JSON.stringify(imm),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/immunizations] error for ${imm.immunizationId}:`, err);
            errors++;
        }
    }

    return { resource: 'IMMUNIZATIONS', synced, skipped: 0, errors, durationMs: Date.now() - start };
}

export async function syncCoverages(
    client: PoolClient,
    simplId: string,
    coverages: PccCoverage[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const cov of coverages) {
        try {
            const primary = cov.payers?.find(p => p.payerRank === 'Primary');

            // Extract DOB and gender from insuredParty if available
            const insured = primary?.insuredParty;
            if (insured?.birthDate || insured?.gender) {
                await client.query(
                    `UPDATE patients SET
                        date_of_birth = COALESCE($1::date, date_of_birth),
                        gender        = COALESCE($2, gender),
                        updated_at    = NOW()
                     WHERE simpl_id = $3`,
                    [insured.birthDate ?? null, insured.gender ?? null, simplId]
                );
            }

            await client.query(
                `INSERT INTO coverages
                    (simpl_id, coverage_id, effective_from, primary_payer_name, primary_payer_type, payers, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (simpl_id, coverage_id) DO UPDATE SET
                    effective_from       = EXCLUDED.effective_from,
                    primary_payer_name   = EXCLUDED.primary_payer_name,
                    primary_payer_type   = EXCLUDED.primary_payer_type,
                    payers               = EXCLUDED.payers,
                    raw_data             = EXCLUDED.raw_data,
                    synced_at            = NOW()`,
                [
                    simplId,
                    cov.coverageId,
                    cov.effectiveFromDateTime ?? null,
                    primary?.payerName,
                    primary?.payerType,
                    JSON.stringify(cov.payers ?? []),
                    JSON.stringify(cov),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/coverages] error for ${cov.coverageId}:`, err);
            errors++;
        }
    }

    return { resource: 'COVERAGES', synced, skipped: 0, errors, durationMs: Date.now() - start };
}
