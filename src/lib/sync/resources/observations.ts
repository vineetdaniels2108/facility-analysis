import { PoolClient } from 'pg';
import { PccObservation, SyncResult } from '../types';

export async function syncObservations(
    client: PoolClient,
    simplId: string,
    observations: PccObservation[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const o of observations) {
        try {
            const loinc = o.methodCode?.codings?.[0]?.code;
            await client.query(
                `INSERT INTO observations
                    (simpl_id, observation_id, type, value, unit, systolic_value,
                     diastolic_value, method, loinc_code, recorded_at, recorded_by,
                     is_struck_out, warnings, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 ON CONFLICT (simpl_id, observation_id) DO UPDATE SET
                    value            = EXCLUDED.value,
                    systolic_value   = EXCLUDED.systolic_value,
                    diastolic_value  = EXCLUDED.diastolic_value,
                    is_struck_out    = EXCLUDED.is_struck_out,
                    warnings         = EXCLUDED.warnings,
                    synced_at        = NOW()`,
                [
                    simplId,
                    o.observationId,
                    o.type,
                    o.value ?? null,
                    o.unit,
                    o.systolicValue ?? null,
                    o.diastolicValue ?? null,
                    o.method,
                    loinc,
                    o.recordedDate ?? null,
                    o.recordedBy,
                    o.strikeOutFlag ?? false,
                    JSON.stringify(o.warnings ?? []),
                    JSON.stringify(o),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/observations] error for ${o.observationId}:`, err);
            errors++;
        }
    }

    return { resource: 'OBSERVATIONS', synced, skipped: 0, errors, durationMs: Date.now() - start };
}
