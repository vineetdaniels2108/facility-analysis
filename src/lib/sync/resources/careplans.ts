import { PoolClient } from 'pg';
import { PccCarePlan, SyncResult } from '../types';

export async function syncCarePlans(
    client: PoolClient,
    simplId: string,
    plans: PccCarePlan[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const plan of plans) {
        try {
            await client.query(
                `INSERT INTO care_plans
                    (simpl_id, care_plan_id, status, next_review_date,
                     created_by, plan_created_at, revised_by, revised_at, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 ON CONFLICT (simpl_id, care_plan_id) DO UPDATE SET
                    status           = EXCLUDED.status,
                    next_review_date = EXCLUDED.next_review_date,
                    revised_by       = EXCLUDED.revised_by,
                    revised_at       = EXCLUDED.revised_at,
                    raw_data         = EXCLUDED.raw_data,
                    synced_at        = NOW()`,
                [
                    simplId,
                    plan.carePlanId,
                    plan.status,
                    plan.nextReviewDate ?? null,
                    plan.createdBy,
                    plan.createdDate ?? null,
                    plan.revisionBy,
                    plan.revisionDate ?? null,
                    JSON.stringify(plan),
                ]
            );

            // Upsert each focus for searchability
            for (const focus of plan.focuses ?? []) {
                await client.query(
                    `INSERT INTO care_plan_focuses
                        (simpl_id, care_plan_id, focus_id, description, status, focus_created_at)
                     VALUES ($1,$2,$3,$4,$5,$6)
                     ON CONFLICT (simpl_id, care_plan_id, focus_id) DO UPDATE SET
                        description      = EXCLUDED.description,
                        status           = EXCLUDED.status,
                        synced_at        = NOW()`,
                    [
                        simplId,
                        plan.carePlanId,
                        focus.focusId,
                        focus.description,
                        focus.status,
                        focus.createdDate ?? null,
                    ]
                );
            }

            synced++;
        } catch (err) {
            console.error(`[sync/careplans] error for ${plan.carePlanId}:`, err);
            errors++;
        }
    }

    return { resource: 'CAREPLANS', synced, skipped: 0, errors, durationMs: Date.now() - start };
}
