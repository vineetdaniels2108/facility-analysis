import { PoolClient } from 'pg';
import { PccAssessment, SyncResult } from '../types';

export async function syncAssessments(
    client: PoolClient,
    simplId: string,
    assessments: PccAssessment[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const a of assessments) {
        try {
            await client.query(
                `INSERT INTO assessments
                    (simpl_id, assessment_id, description, assessment_type, status,
                     score, template_id, template_version, cms_template_id,
                     ref_date, created_by, revised_by, revised_at, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 ON CONFLICT (simpl_id, assessment_id) DO UPDATE SET
                    status           = EXCLUDED.status,
                    score            = EXCLUDED.score,
                    revised_by       = EXCLUDED.revised_by,
                    revised_at       = EXCLUDED.revised_at,
                    synced_at        = NOW()`,
                [
                    simplId,
                    a.assessmentId,
                    a.assessmentDescription,
                    a.assessmentTypeDescription,
                    a.assessmentStatus,
                    a.assessmentScore ?? null,
                    a.templateId ?? null,
                    a.templateVersion ?? null,
                    a.cmsTemplateId,
                    a.assessmentRefDate ?? null,
                    a.createdBy,
                    a.revisionBy,
                    a.revisionDate ?? null,
                    JSON.stringify(a),
                ]
            );
            synced++;
        } catch (err) {
            console.error(`[sync/assessments] error for ${a.assessmentId}:`, err);
            errors++;
        }
    }

    return { resource: 'ASSESSMENTS', synced, skipped: 0, errors, durationMs: Date.now() - start };
}
