import OpenAI from 'openai';
import { PatientContext, AnalysisResult, Severity } from '../types';

const SEVERITY_THRESHOLD: Record<Severity, number> = {
    critical: 4, high: 3, medium: 2, low: 1, normal: 0,
};

interface AIReviewInput {
    ctx: PatientContext;
    ruleResults: AnalysisResult[];
}

function buildPrompt(ctx: PatientContext, ruleResults: AnalysisResult[]): string {
    const labSummary = Object.entries(ctx.labs)
        .filter(([, v]) => v.value != null)
        .map(([name, v]) => {
            const flag = v.isAbnormal ? (v.isCritical ? ' **CRITICAL**' : ' *ABNORMAL*') : '';
            const trend = v.trend && v.trend !== 'stable' ? ` (${v.trend})` : '';
            const ref = (v.refLow != null && v.refHigh != null) ? ` [ref: ${v.refLow}-${v.refHigh}]` : '';
            return `  ${name}: ${v.value} ${v.unit}${ref}${trend}${flag}`;
        })
        .join('\n');

    const condSummary = ctx.activeConditions.length > 0
        ? ctx.activeConditions.map(c => `  ${c.icd10} — ${c.description}`).join('\n')
        : '  None documented';

    const medSummary = ctx.activeMedications.length > 0
        ? ctx.activeMedications.slice(0, 30).map(m => `  ${m.name}${m.directions ? ` (${m.directions.slice(0, 80)})` : ''}`).join('\n')
        : '  None documented';

    const cpSummary = ctx.carePlanFocuses.length > 0
        ? ctx.carePlanFocuses.slice(0, 20).map(f => `  ${f}`).join('\n')
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

    const ruleSummary = ruleResults
        .filter(r => SEVERITY_THRESHOLD[r.severity] >= 1)
        .map(r => `  ${r.analysisType}: ${r.severity.toUpperCase()} (score ${r.score}) — ${r.reasoning}`)
        .join('\n') || '  All normal';

    return `You are a clinical decision support AI for skilled nursing facilities. Analyze this patient and provide risk assessments.

## Patient Data

### Latest Labs
${labSummary || '  No labs available'}

### Active Diagnoses (ICD-10)
${condSummary}

### Active Medications
${medSummary}

### Care Plan Focuses
${cpSummary}

### Vitals
${vitalsSummary}

### Assessment Scores
${Object.entries(ctx.assessmentScores).length > 0
    ? Object.entries(ctx.assessmentScores).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '  None'}

### Rule-Based Analysis (already computed)
${ruleSummary}

## Instructions

Review the full clinical picture. For each of these 5 risk areas, provide your assessment:
1. **infusion** — IV fluid/albumin infusion need
2. **transfusion** — Blood transfusion need
3. **foley_risk** — Likelihood of needing a Foley catheter
4. **gtube_risk** — Likelihood of needing a G-tube
5. **mtn_risk** — Malnutrition/MTN therapy need

For each, consider factors the rule-based system may have missed:
- Medication side effects that increase risk
- Diagnosis combinations that compound risk
- Care plan signals indicating clinical concern
- Lab trends over time (not just current values)

Respond with JSON only. No markdown, no explanation outside the JSON.`;
}

export async function runAIReview(input: AIReviewInput): Promise<AnalysisResult[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('[ai-reviewer] OPENAI_API_KEY not set, skipping AI review');
        return [];
    }

    const maxSeverity = Math.max(
        ...input.ruleResults.map(r => SEVERITY_THRESHOLD[r.severity]),
        0
    );
    if (maxSeverity < SEVERITY_THRESHOLD.low) {
        return [];
    }

    const openai = new OpenAI({ apiKey });
    const prompt = buildPrompt(input.ctx, input.ruleResults);

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: `You are a clinical decision support system for skilled nursing facilities. Respond ONLY with a JSON object in this exact format:
{"assessments":[{"type":"infusion","severity":"critical","confidence":0.95,"reasoning":"...","recommendations":["..."],"missed_factors":["..."]}]}
Each assessment must have: type (one of infusion/transfusion/foley_risk/gtube_risk/mtn_risk), severity (critical/high/medium/low/normal), confidence (0-1), reasoning (string), recommendations (array of strings), missed_factors (array of strings).
Only include assessments where you have something meaningful to add beyond the rule-based analysis. Skip normal/unchanged ones.` },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 1500,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        const parsed = JSON.parse(content) as {
            assessments: Array<{
                type: string;
                severity: string;
                confidence: number;
                reasoning: string;
                recommendations?: string[];
                missed_factors?: string[];
            }>;
        };

        return parsed.assessments.map(a => ({
            analysisType: `ai_${a.type}`,
            severity: (a.severity as Severity) || 'normal',
            score: Math.round(a.confidence * 100),
            priority: a.severity === 'critical' || a.severity === 'high' ? 'action_needed' : a.severity === 'medium' ? 'monitor' : 'none',
            reasoning: a.reasoning,
            keyIndicators: {
                confidence: a.confidence,
                recommendations: a.recommendations ?? [],
                missed_factors: a.missed_factors ?? [],
                model: 'gpt-4o-mini',
            },
        }));
    } catch (err) {
        console.error('[ai-reviewer] OpenAI call failed:', err);
        return [];
    }
}
