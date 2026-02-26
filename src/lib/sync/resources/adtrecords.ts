import { PoolClient } from 'pg';
import { PccAdtRecord, SyncResult } from '../types';

export async function syncAdtRecords(
    client: PoolClient,
    simplId: string,
    records: PccAdtRecord[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const r of records) {
        try {
            await client.query(
                `INSERT INTO adt_records
                    (simpl_id, adt_record_id, action_type, action_code, standard_action,
                     payer_name, payer_type, payer_code, room, bed, unit, floor,
                     is_outpatient, admission_source, admission_type, origin, origin_type,
                     destination, destination_type, discharge_status, transfer_reason,
                     effective_at, entered_at, entered_by, is_cancelled, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
                 ON CONFLICT (simpl_id, adt_record_id) DO UPDATE SET
                    action_type      = EXCLUDED.action_type,
                    payer_name       = EXCLUDED.payer_name,
                    payer_type       = EXCLUDED.payer_type,
                    room             = EXCLUDED.room,
                    bed              = EXCLUDED.bed,
                    unit             = EXCLUDED.unit,
                    effective_at     = EXCLUDED.effective_at,
                    is_cancelled     = EXCLUDED.is_cancelled,
                    raw_data         = EXCLUDED.raw_data,
                    synced_at        = NOW()`,
                [
                    simplId,
                    r.adtRecordId,
                    r.actionType,
                    r.actionCode,
                    r.standardActionType,
                    r.payerName,
                    r.payerType,
                    r.payerCode,
                    r.roomDesc,
                    r.bedDesc,
                    r.unitDesc,
                    r.floorDesc,
                    r.outpatient ?? false,
                    r.admissionSource,
                    r.admissionType,
                    r.origin,
                    r.originType,
                    r.destination,
                    r.destinationType,
                    r.dischargeStatus,
                    r.transferReason,
                    r.effectiveDateTime ?? null,
                    r.enteredDate ?? null,
                    r.enteredBy,
                    r.isCancelledRecord ?? false,
                    JSON.stringify(r),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/adtrecords] error for ${r.adtRecordId}:`, err);
            errors++;
        }
    }

    return { resource: 'ADTRECORD', synced, skipped: 0, errors, durationMs: Date.now() - start };
}

// Extract current room/location from most recent non-cancelled ADT record
export function extractCurrentLocation(records: PccAdtRecord[]): {
    room: string | null;
    bed: string | null;
    unit: string | null;
    floor: string | null;
    admitDate: string | null;
} {
    const active = records
        .filter(r => !r.isCancelledRecord)
        .sort((a, b) => {
            const da = a.effectiveDateTime ? new Date(a.effectiveDateTime).getTime() : 0;
            const db = b.effectiveDateTime ? new Date(b.effectiveDateTime).getTime() : 0;
            return db - da;
        });

    const current = active[0];

    // Find earliest admission record
    const admissionRecord = [...active]
        .reverse()
        .find(r => r.standardActionType === 'Admission' || r.actionCode === 'A');

    return {
        room: current?.roomDesc ?? null,
        bed: current?.bedDesc ?? null,
        unit: current?.unitDesc ?? null,
        floor: current?.floorDesc ?? null,
        admitDate: admissionRecord?.effectiveDateTime?.split('T')[0] ?? null,
    };
}
