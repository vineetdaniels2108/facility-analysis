import { PoolClient } from 'pg';
import { PccCondition, SyncResult } from '../types';

export async function syncConditions(
    client: PoolClient,
    simplId: string,
    conditions: PccCondition[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const c of conditions) {
        try {
            const snomed = c.conditionCode?.codings?.[0];
            await client.query(
                `INSERT INTO conditions
                    (simpl_id, condition_id, snomed_code, snomed_display, icd10_code,
                     icd10_description, onset_date, clinical_status, rank_description,
                     classification, is_principal, is_therapy, created_by,
                     condition_created_at, revised_by, revised_at, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                 ON CONFLICT (simpl_id, condition_id) DO UPDATE SET
                    clinical_status  = EXCLUDED.clinical_status,
                    rank_description = EXCLUDED.rank_description,
                    revised_by       = EXCLUDED.revised_by,
                    revised_at       = EXCLUDED.revised_at,
                    raw_data         = EXCLUDED.raw_data,
                    synced_at        = NOW()`,
                [
                    simplId,
                    c.conditionId,
                    snomed?.code,
                    snomed?.display,
                    c.icd10,
                    c.icd10Description,
                    c.onsetDate ?? null,
                    c.clinicalStatus,
                    c.rankDescription,
                    c.classificationDescription,
                    c.principalDiagnosis ?? false,
                    c.therapy ?? false,
                    c.createdBy,
                    c.createdDate ?? null,
                    c.revisionBy,
                    c.revisionDate ?? null,
                    JSON.stringify(c),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/conditions] error for ${c.conditionId}:`, err);
            errors++;
        }
    }

    return { resource: 'CONDITIONS', synced, skipped: 0, errors, durationMs: Date.now() - start };
}
