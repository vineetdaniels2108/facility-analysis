import { PoolClient } from 'pg';
import { PccMedication, SyncResult } from '../types';

export async function syncMedications(
    client: PoolClient,
    simplId: string,
    medications: PccMedication[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const m of medications) {
        try {
            const routeCoding = m.administration?.route?.coding?.[0];
            await client.query(
                `INSERT INTO medications
                    (simpl_id, order_id, description, generic_name, strength,
                     strength_uom, rxnorm_id, directions, route_code, route_display,
                     status, is_narcotic, controlled_sub_code, start_date, end_date,
                     order_date, discontinue_date, resident_name, created_by,
                     med_created_at, revised_by, revised_at, schedules, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
                 ON CONFLICT (simpl_id, order_id) DO UPDATE SET
                    status           = EXCLUDED.status,
                    end_date         = EXCLUDED.end_date,
                    discontinue_date = EXCLUDED.discontinue_date,
                    directions       = EXCLUDED.directions,
                    schedules        = EXCLUDED.schedules,
                    revised_by       = EXCLUDED.revised_by,
                    revised_at       = EXCLUDED.revised_at,
                    raw_data         = EXCLUDED.raw_data,
                    synced_at        = NOW()`,
                [
                    simplId,
                    m.orderId,
                    m.description,
                    m.generic,
                    m.strength,
                    m.strengthUOM,
                    m.rxNormId,
                    m.directions,
                    routeCoding?.code,
                    routeCoding?.display,
                    m.status,
                    m.narcotic ?? false,
                    m.controlledSubstanceCode,
                    m.startDate ?? null,
                    m.endDate ?? null,
                    m.orderDate ?? null,
                    m.discontinueDate ?? null,
                    m.residentName,
                    m.createdBy,
                    m.createdDate ?? null,
                    m.revisionBy,
                    m.revDate ?? null,
                    JSON.stringify(m.schedules ?? []),
                    JSON.stringify(m),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/medications] error for order ${m.orderId}:`, err);
            errors++;
        }
    }

    return { resource: 'MEDICATIONS', synced, skipped: 0, errors, durationMs: Date.now() - start };
}
