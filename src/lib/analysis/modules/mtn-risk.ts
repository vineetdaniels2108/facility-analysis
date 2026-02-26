import { AnalysisModule, AnalysisResult, PatientContext } from '../types';

// MTN = Medical Therapeutic Nutrition (specialized IV/enteral nutrition intervention)
const MALNUTRITION_CODES = ['E40', 'E41', 'E42', 'E43', 'E44', 'E46'];
const WASTING_CODES = ['M62.50', 'M62.51', 'M62.59', 'R64'];
const WOUND_CODES = ['L89', 'L97', 'L98.4'];
const CANCER_CODES = ['C'];
const CKD_CODES = ['N18'];
const LIVER_CODES = ['K70', 'K71', 'K72', 'K73', 'K74'];
const CARDIAC_CODES = ['I50'];
const COPD_CODES = ['J44'];

export const mtnRiskModule: AnalysisModule = {
    type: 'mtn_risk',
    name: 'Medical Therapeutic Nutrition Risk',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];

        const icd10s = ctx.activeIcd10Codes;

        // ── Albumin trend (most predictive for MTN) ───────────────────────────
        const alb = ctx.labs['ALB'];
        if (alb) {
            indicators.albumin = { value: alb.value, trend: alb.trend };
            if (alb.value < 2.0) {
                score += 90; reasons.push(`Albumin critically low: ${alb.value} g/dL — MTN strongly indicated`);
            } else if (alb.value < 2.5) {
                score += 60; reasons.push(`Albumin severely low: ${alb.value} g/dL`);
            } else if (alb.value < 3.0) {
                score += 35; reasons.push(`Albumin low: ${alb.value} g/dL`);
            }
            if (alb.trend === 'falling') { score += 25; reasons.push('Albumin declining — suggests ongoing nutritional failure'); }
        }

        // ── Prealbumin ────────────────────────────────────────────────────────
        const prealb = ctx.labs['PREALB'];
        if (prealb) {
            indicators.prealbumin = { value: prealb.value, trend: prealb.trend };
            if (prealb.value < 5) {
                score += 70; reasons.push(`Prealbumin critically low: ${prealb.value} mg/dL`);
            } else if (prealb.value < 10) {
                score += 45; reasons.push(`Prealbumin severely low: ${prealb.value} mg/dL`);
            } else if (prealb.value < 15) {
                score += 20; reasons.push(`Prealbumin low: ${prealb.value} mg/dL`);
            }
            if (prealb.trend === 'falling') { score += 15; reasons.push('Prealbumin declining'); }
        }

        // ── Malnutrition diagnoses ─────────────────────────────────────────────
        const malnDx = icd10s.filter(c => MALNUTRITION_CODES.some(m => c.startsWith(m)));
        if (malnDx.length > 0) {
            score += 35; reasons.push(`Malnutrition diagnosis: ${malnDx.join(', ')}`);
            indicators.malnutritionCodes = malnDx;
        }

        // ── Muscle wasting ────────────────────────────────────────────────────
        if (icd10s.some(c => WASTING_CODES.some(m => c.startsWith(m)))) {
            score += 30; reasons.push('Muscle wasting / cachexia diagnosis');
            indicators.wasting = true;
        }

        // ── Active pressure wounds (MTN accelerates healing) ──────────────────
        if (icd10s.some(c => WOUND_CODES.some(m => c.startsWith(m)))) {
            score += 25; reasons.push('Active pressure ulcer/wound (nutritional support accelerates healing)');
            indicators.wounds = true;
        }

        // ── High-demand conditions (increase protein/calorie needs) ───────────
        if (icd10s.some(c => CANCER_CODES.some(m => c.startsWith(m)))) {
            score += 30; reasons.push('Active cancer diagnosis (high metabolic demand)');
            indicators.cancer = true;
        }
        if (icd10s.some(c => COPD_CODES.some(m => c.startsWith(m)))) {
            score += 15; reasons.push('COPD (increased respiratory work increases calorie needs)');
            indicators.copd = true;
        }
        if (icd10s.some(c => CARDIAC_CODES.some(m => c.startsWith(m)))) {
            score += 15; reasons.push('Heart failure (cardiac cachexia risk)');
            indicators.heartFailure = true;
        }

        // ── CKD / Liver disease (specialized diet needs) ──────────────────────
        if (icd10s.some(c => CKD_CODES.some(m => c.startsWith(m)))) {
            score += 20; reasons.push('CKD (specialized renal nutrition needed)');
            indicators.ckd = true;
        }
        if (icd10s.some(c => LIVER_CODES.some(m => c.startsWith(m)))) {
            score += 20; reasons.push('Liver disease (hepatic nutrition protocol)');
            indicators.liverDisease = true;
        }

        // ── Care plan nutritional signals ─────────────────────────────────────
        const nutritionFocus = ctx.carePlanFocuses.find(f =>
            f.includes('weight loss') || f.includes('nutrition') || f.includes('supplement')
            || f.includes('malnutrition') || f.includes('fluid deficit')
        );
        if (nutritionFocus) {
            score += 15; reasons.push('Active nutrition care plan focus');
            indicators.nutritionCarePlan = nutritionFocus.slice(0, 80);
        }

        // ── Nutritional Risk Assessment score ─────────────────────────────────
        const nutritionalRiskScore = Object.entries(ctx.assessmentScores)
            .find(([key]) => key.toLowerCase().includes('nutritional') || key.toLowerCase().includes('nutrition'));
        if (nutritionalRiskScore) {
            const [name, val] = nutritionalRiskScore;
            indicators.nutritionalRiskScore = { assessment: name, score: val };
            if (val >= 18) { score += 25; reasons.push(`High nutritional risk assessment score: ${val} (${name})`); }
            else if (val >= 12) { score += 10; reasons.push(`Elevated nutritional risk score: ${val}`); }
        }

        const severity = score >= 100 ? 'critical'
            : score >= 60 ? 'high'
            : score >= 30 ? 'medium'
            : score > 0 ? 'low'
            : 'normal';

        return {
            analysisType: 'mtn_risk',
            severity,
            score,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No MTN risk indicators detected.',
            keyIndicators: indicators,
        };
    },
};
