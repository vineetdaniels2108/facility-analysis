import { PoolClient } from 'pg';
import { PccProgressNote, SyncResult } from '../types';

export async function syncProgressNotes(
    client: PoolClient,
    simplId: string,
    notes: PccProgressNote[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const note of notes) {
        try {
            const loinc = note.noteCode?.codings?.[0]?.code;
            await client.query(
                `INSERT INTO progress_notes
                    (simpl_id, note_id, note_type, effective_at, note_created_at,
                     created_by, loinc_code, follow_up_to_id, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 ON CONFLICT (simpl_id, note_id) DO UPDATE SET
                    note_type        = EXCLUDED.note_type,
                    effective_at     = EXCLUDED.effective_at,
                    synced_at        = NOW()`,
                [
                    simplId,
                    note.progressNoteId,
                    note.progressNoteType,
                    note.effectiveDate ?? null,
                    note.createdDate ?? null,
                    note.createdBy,
                    loinc,
                    note.followUpTo?.progressNoteId ?? null,
                    JSON.stringify(note),
                ]
            );

            // Delete old sections for this note and re-insert (sections may change)
            await client.query(
                `DELETE FROM progress_note_sections WHERE note_id = $1 AND simpl_id = $2`,
                [note.progressNoteId, simplId]
            );

            for (const section of note.sections ?? []) {
                if (!section.value) continue;
                await client.query(
                    `INSERT INTO progress_note_sections
                        (simpl_id, note_id, section_name, section_value)
                     VALUES ($1,$2,$3,$4)`,
                    [simplId, note.progressNoteId, section.name, section.value]
                );
            }

            synced++;
        } catch (err) {
            console.error(`[sync/progressnotes] error for ${note.progressNoteId}:`, err);
            errors++;
        }
    }

    return { resource: 'PROGRESSNOTES', synced, skipped: 0, errors, durationMs: Date.now() - start };
}
