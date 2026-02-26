import { AnalysisModule, AnalysisResult, PatientContext } from '../types';

const DYSPHAGIA_CODES = ['R13', 'R13.0', 'R13.1', 'R13.10', 'R13.11', 'R13.12', 'R13.13', 'R13.14', 'R13.19'];
const MALNUTRITION_CODES = ['E40', 'E41', 'E42', 'E43', 'E44', 'E46'];
const ASPIRATION_CODES = ['J69.0', 'J69', 'J68.0'];
const STROKE_CODES = ['I63', 'I64', 'I69'];
const ALS_DEMENTIA_CODES = ['G12.21', 'G30', 'G31', 'G35', 'G20'];
const HEAD_NECK_CANCER = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C09', 'C10', 'C32'];

export const gtubeRiskModule: AnalysisModule = {
    type: 'gtube_risk',
    name: 'G-Tube Placement Risk',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];

        const icd10s = ctx.activeIcd10Codes;

        // ── Dysphagia (primary predictor) ────────────────────────────────────
        if (icd10s.some(c => DYSPHAGIA_CODES.some(m => c.startsWith(m)))) {
            score += 80; reasons.push('Active dysphagia diagnosis');
            indicators.dysphagia = true;
        }
        const dysphagiaFocus = ctx.carePlanFocuses.find(f =>
            f.includes('dysphagia') || f.includes('swallow') || f.includes('aspiration')
        );
        if (dysphagiaFocus) {
            score += 30; reasons.push('Dysphagia/swallowing care plan focus');
            indicators.dysphagiaCarePlan = dysphagiaFocus.slice(0, 80);
        }

        // ── Modified diet (pureed / thickened liquids) ────────────────────────
        const modifiedDietFocus = ctx.carePlanFocuses.find(f =>
            f.includes('pureed') || f.includes('thickened') || f.includes('modified texture')
            || f.includes('mechanically') || f.includes('diet order other than regular')
        );
        if (modifiedDietFocus) {
            score += 25; reasons.push('Modified diet texture order (pureed/thickened)');
            indicators.modifiedDiet = modifiedDietFocus.slice(0, 80);
        }

        // ── Malnutrition ──────────────────────────────────────────────────────
        if (icd10s.some(c => MALNUTRITION_CODES.some(m => c.startsWith(m)))) {
            score += 40; reasons.push('Active malnutrition diagnosis');
            indicators.malnutrition = true;
        }

        // ── Low albumin (nutritional failure) ─────────────────────────────────
        const alb = ctx.labs['ALB'];
        if (alb) {
            if (alb.value < 2.5) {
                score += 40; reasons.push(`Albumin severely low: ${alb.value} g/dL`);
                indicators.albumin = alb.value;
            } else if (alb.value < 3.0) {
                score += 20; reasons.push(`Albumin low: ${alb.value} g/dL`);
                indicators.albumin = alb.value;
            }
            if (alb.trend === 'falling') { score += 15; reasons.push('Albumin trending down'); }
        }

        // ── Prealbumin (short-term nutritional status) ────────────────────────
        const prealb = ctx.labs['PREALB'];
        if (prealb && prealb.value < 10) {
            score += 25; reasons.push(`Prealbumin low: ${prealb.value} mg/dL`);
            indicators.prealbumin = prealb.value;
        }

        // ── Aspiration pneumonia ──────────────────────────────────────────────
        if (icd10s.some(c => ASPIRATION_CODES.some(m => c.startsWith(m)))) {
            score += 50; reasons.push('Aspiration pneumonia history');
            indicators.aspirationPneumonia = true;
        }

        // ── Neurological conditions causing impaired swallowing ───────────────
        if (icd10s.some(c => ALS_DEMENTIA_CODES.some(m => c.startsWith(m)))) {
            score += 30; reasons.push('Progressive neurological condition (ALS/dementia/Parkinson\'s)');
            indicators.neurologicalCondition = true;
        }
        if (icd10s.some(c => STROKE_CODES.some(m => c.startsWith(m)))) {
            score += 35; reasons.push('Stroke history (swallowing impairment risk)');
            indicators.stroke = true;
        }

        // ── Head/neck cancer ──────────────────────────────────────────────────
        if (icd10s.some(c => HEAD_NECK_CANCER.some(m => c.startsWith(m)))) {
            score += 60; reasons.push('Head/neck cancer (direct swallowing impairment)');
            indicators.headNeckCancer = true;
        }

        // ── Fluid deficit care plan ────────────────────────────────────────────
        const fluidFocus = ctx.carePlanFocuses.find(f =>
            f.includes('fluid deficit') || f.includes('dehydration')
        );
        if (fluidFocus) {
            score += 15; reasons.push('Active fluid deficit care plan focus');
        }

        // ── Nutritional supplement orders ──────────────────────────────────────
        const suppFocus = ctx.carePlanFocuses.find(f =>
            f.includes('supplement') || f.includes('ensure') || f.includes('boost')
        );
        if (suppFocus) {
            score += 10; reasons.push('Nutritional supplement in care plan');
        }

        const severity = score >= 120 ? 'critical'
            : score >= 70 ? 'high'
            : score >= 35 ? 'medium'
            : score > 0 ? 'low'
            : 'normal';

        return {
            analysisType: 'gtube_risk',
            severity,
            score,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No g-tube risk indicators detected.',
            keyIndicators: indicators,
        };
    },
};
