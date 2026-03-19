import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildPatientContext } from '@/lib/analysis/context';
import { query } from '@/lib/db/client';

interface CCMNoteSection {
    title: string;
    content: string;
}

interface StoredNote {
    id: number;
    sections: CCMNoteSection[];
    complexity_tier: string;
    condition_count: number;
    model: string;
    generated_at: string;
    generated_by: string | null;
}

function buildCCMPrompt(
    ctx: Awaited<ReturnType<typeof buildPatientContext>>,
    ccmIndicators: Record<string, unknown>,
): string {
    if (!ctx) return '';

    const qualifyingConditions = (ccmIndicators.qualifyingConditions ?? []) as Array<{
        icd10: string; description: string; category: string; categoryLabel: string;
    }>;
    const missingMonitoring = (ccmIndicators.missingMonitoring ?? []) as Array<{
        condition: string; gap: string; recommendation: string;
    }>;
    const complexityTier = (ccmIndicators.complexityTier as string) ?? 'standard';

    const condList = qualifyingConditions
        .map(c => `  - ${c.categoryLabel}: ${c.description} (${c.icd10})`)
        .join('\n');

    const medList = ctx.activeMedications.length > 0
        ? ctx.activeMedications.slice(0, 40).map(m =>
            `  - ${m.name}${m.directions ? ` — ${m.directions.slice(0, 100)}` : ''}`
        ).join('\n')
        : '  None documented';

    const labSummary = Object.entries(ctx.labs)
        .filter(([, v]) => v.value != null)
        .map(([name, v]) => {
            const flag = v.isAbnormal ? (v.isCritical ? ' **CRITICAL**' : ' *ABNORMAL*') : '';
            const trend = v.trend && v.trend !== 'stable' ? ` (${v.trend})` : '';
            const ref = (v.refLow != null && v.refHigh != null) ? ` [ref: ${v.refLow}-${v.refHigh}]` : '';
            return `  ${name}: ${v.value} ${v.unit}${ref}${trend}${flag}`;
        })
        .join('\n') || '  No labs available';

    const cpSummary = ctx.carePlanFocuses.length > 0
        ? ctx.carePlanFocuses.slice(0, 20).map(f => `  - ${f}`).join('\n')
        : '  None';

    const vitalsSummary = Object.entries(ctx.vitals)
        .filter(([, v]) => v != null)
        .map(([type, v]) => {
            if (!v) return '';
            if (type === 'bloodPressure' && 'systolic' in v) return `  BP: ${v.systolic}/${v.diastolic}`;
            if ('value' in v) return `  ${type}: ${v.value}`;
            return '';
        })
        .filter(Boolean)
        .join('\n') || '  None recorded';

    const monitoringGaps = missingMonitoring.length > 0
        ? missingMonitoring.map(m => `  - ${m.condition}: ${m.gap} → ${m.recommendation}`).join('\n')
        : '  None identified';

    return `You are a Medicare Chronic Care Management (CCM) documentation specialist for skilled nursing facilities.

Generate a complete, audit-ready CCM clinical note for this patient. The note must satisfy all CMS/Medicare documentation requirements for CCM billing (CPT 99490/99491).

## Patient Clinical Data

### Qualifying Chronic Conditions (${qualifyingConditions.length} conditions — ${complexityTier} complexity)
${condList}

### Current Medications
${medList}

### Latest Labs
${labSummary}

### Active Care Plan Focuses
${cpSummary}

### Current Vitals
${vitalsSummary}

### Monitoring Gaps
${monitoringGaps}

## Instructions

Generate the CCM note as a JSON object with a "sections" array. Each section must have a "title" and "content" field. The content should be formatted as a clinical note that a provider can copy directly into the EHR.

Required sections (in this exact order):

1. **Chronic Conditions Summary** — List each qualifying chronic condition with ICD-10 code, current status based on available labs/vitals, and whether it is controlled/uncontrolled.

2. **Comprehensive Care Plan** — For EACH chronic condition, include:
   - Current treatment goals
   - Active interventions (medications, therapies, monitoring)
   - Target outcomes
   - Responsible provider/discipline
   Format as a structured plan, condition by condition.

3. **Medication Review** — Review all current medications, organized by the condition they treat. Note any:
   - Potential interactions
   - Optimization opportunities
   - Adherence concerns in an SNF setting

4. **Care Coordination** — Document:
   - Coordination between disciplines (nursing, MD, specialists, pharmacy, therapy)
   - Pending or recommended referrals
   - Communication with patient/family/representative

5. **Monitoring Plan** — For each condition, specify:
   - Labs to order and frequency
   - Vitals monitoring schedule
   - Assessment tools to use (PHQ-9, Morse Fall Scale, etc.)
   - Follow-up timeline
   Address any identified monitoring gaps.

6. **24/7 Access & Care Continuity** — Standard documentation that the patient has 24/7 access to a care team member for urgent needs, with the facility's care continuity arrangement.

7. **Consent Documentation** — Reminder text prompting the provider to document:
   - Patient or authorized representative consent for CCM services
   - Date consent was obtained
   - Explanation of cost-sharing if applicable

8. **Time Documentation** — A structured template for the provider to fill in:
   - Date of service
   - Time spent (start/end or total minutes)
   - Activities performed (medication review, care coordination, care plan update, etc.)
   - Staff/provider performing the service
   Include a note about the 20-minute minimum for CPT 99490 and 30-minute minimum for CPT 99491.

Write the note in professional clinical language. Be specific to THIS patient's conditions, medications, and labs — do not use generic templates. Each section content should be ready to paste into an EHR.

Respond ONLY with the JSON object. No markdown, no explanation outside the JSON.`;
}

// GET: retrieve the most recent saved CCM note for this patient
export async function GET(
    request: Request,
    { params }: { params: Promise<{ simplId: string }> }
) {
    try {
        const { simplId } = await params;

        const res = await query<StoredNote>(
            `SELECT id, sections, complexity_tier, condition_count, model,
                    generated_at::text, generated_by
             FROM ccm_notes
             WHERE simpl_id = $1 AND is_current = TRUE
             ORDER BY generated_at DESC
             LIMIT 1`,
            [simplId]
        );

        if (res.rows.length === 0) {
            return NextResponse.json({ note: null });
        }

        const row = res.rows[0];
        return NextResponse.json({
            note: {
                id: row.id,
                sections: row.sections,
                complexityTier: row.complexity_tier,
                conditionCount: row.condition_count,
                model: row.model,
                generatedAt: row.generated_at,
                generatedBy: row.generated_by,
            },
        });
    } catch (error) {
        console.error('[ccm-note] Error fetching saved note:', error);
        return NextResponse.json({ note: null });
    }
}

// POST: generate a new CCM note, save it, and return it
export async function POST(
    request: Request,
    { params }: { params: Promise<{ simplId: string }> }
) {
    try {
        const { simplId } = await params;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'AI note generation is not configured (OPENAI_API_KEY missing)' },
                { status: 503 }
            );
        }

        const ctx = await buildPatientContext(simplId);
        if (!ctx) {
            return NextResponse.json(
                { error: 'Patient not found or no data available' },
                { status: 404 }
            );
        }

        const analysisRes = await query<{ key_indicators: Record<string, unknown> }>(
            `SELECT key_indicators FROM analysis_results
             WHERE simpl_id = $1 AND analysis_type = 'ccm' AND is_current = TRUE
             ORDER BY computed_at DESC LIMIT 1`,
            [simplId]
        );

        const ccmIndicators = analysisRes.rows[0]?.key_indicators ?? {};
        const isEligible = ccmIndicators.isEligible as boolean | undefined;

        if (!isEligible) {
            return NextResponse.json(
                { error: 'Patient does not meet CCM eligibility criteria (requires 2+ chronic conditions)' },
                { status: 400 }
            );
        }

        const complexityTier = (ccmIndicators.complexityTier as string) ?? 'standard';
        const conditionCount = (ccmIndicators.conditionCount as number) ?? 0;

        const openai = new OpenAI({ apiKey });
        const prompt = buildCCMPrompt(ctx, ccmIndicators);

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a Medicare CCM documentation specialist. Generate audit-ready clinical notes. Respond ONLY with valid JSON in the format: {"sections": [{"title": "...", "content": "..."}]}',
                },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 4000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            return NextResponse.json(
                { error: 'AI did not generate a response' },
                { status: 500 }
            );
        }

        const parsed = JSON.parse(content) as { sections: CCMNoteSection[] };
        const sections = parsed.sections ?? [];
        const modelUsed = 'gpt-4o-mini';

        // Mark previous notes as not current
        await query(
            `UPDATE ccm_notes SET is_current = FALSE WHERE simpl_id = $1`,
            [simplId]
        );

        // Insert the new note
        const insertRes = await query<{ id: number; generated_at: string }>(
            `INSERT INTO ccm_notes (simpl_id, sections, complexity_tier, condition_count, model, is_current)
             VALUES ($1, $2, $3, $4, $5, TRUE)
             RETURNING id, generated_at::text`,
            [simplId, JSON.stringify(sections), complexityTier, conditionCount, modelUsed]
        );

        const row = insertRes.rows[0];

        return NextResponse.json({
            note: {
                id: row.id,
                sections,
                complexityTier,
                conditionCount,
                model: modelUsed,
                generatedAt: row.generated_at,
                generatedBy: null,
            },
        });
    } catch (error) {
        console.error('[ccm-note] Error generating CCM note:', error);
        return NextResponse.json(
            { error: 'Failed to generate CCM note' },
            { status: 500 }
        );
    }
}
