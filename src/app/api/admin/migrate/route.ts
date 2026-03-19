import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';

export async function GET() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS ccm_notes (
                id              SERIAL PRIMARY KEY,
                simpl_id        UUID NOT NULL REFERENCES patients(simpl_id),
                sections        JSONB NOT NULL,
                complexity_tier TEXT,
                condition_count INT,
                model           TEXT,
                generated_at    TIMESTAMPTZ DEFAULT NOW(),
                generated_by    TEXT,
                is_current      BOOLEAN DEFAULT TRUE
            )
        `);

        await query(`
            CREATE INDEX IF NOT EXISTS idx_ccm_notes_patient
            ON ccm_notes(simpl_id) WHERE is_current = TRUE
        `);

        return NextResponse.json({ ok: true, message: 'ccm_notes table created' });
    } catch (error) {
        console.error('[migrate] Error:', error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
