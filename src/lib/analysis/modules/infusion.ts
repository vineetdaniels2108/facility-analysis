import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

// ICD-10 codes that indicate malnutrition / infusion need
const MALNUTRITION_CODES = ['E40', 'E41', 'E42', 'E43', 'E44', 'E45', 'E46', 'E50'];
const WASTING_CODES = ['M62.5', 'R64'];

export const infusionModule: AnalysisModule = {
    type: 'infusion',
    name: 'Infusion Analysis',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];

        // ── Albumin ─────────────────────────────────────────────────────────
        const alb = ctx.labs['ALB'];
        if (alb) {
            indicators.albumin = { value: alb.value, unit: alb.unit, trend: alb.trend };
            if (alb.value < 2.0) {
                score += 100; reasons.push(`Albumin critically low: ${alb.value} g/dL`);
            } else if (alb.value < 2.5) {
                score += 70; reasons.push(`Albumin severely low: ${alb.value} g/dL`);
            } else if (alb.value < 3.0) {
                score += 40; reasons.push(`Albumin low: ${alb.value} g/dL`);
            } else if (alb.value < 3.5) {
                score += 15; reasons.push(`Albumin borderline: ${alb.value} g/dL`);
            }
            if (alb.trend === 'falling') { score += 20; reasons.push('Albumin trending down'); }
        }

        // ── Prealbumin ───────────────────────────────────────────────────────
        const prealb = ctx.labs['PREALB'];
        if (prealb) {
            indicators.prealbumin = { value: prealb.value, unit: prealb.unit, trend: prealb.trend };
            if (prealb.value < 5) {
                score += 80; reasons.push(`Prealbumin critically low: ${prealb.value} mg/dL`);
            } else if (prealb.value < 10) {
                score += 50; reasons.push(`Prealbumin severely low: ${prealb.value} mg/dL`);
            } else if (prealb.value < 15) {
                score += 25; reasons.push(`Prealbumin low: ${prealb.value} mg/dL`);
            }
            if (prealb.trend === 'falling') { score += 15; reasons.push('Prealbumin trending down'); }
        }

        // ── Total Protein ────────────────────────────────────────────────────
        const tprot = ctx.labs['TPROT'];
        if (tprot && tprot.value < 5.5) {
            score += 30;
            reasons.push(`Total protein low: ${tprot.value} g/dL`);
            indicators.totalProtein = tprot.value;
        }

        // ── Conditions: malnutrition ICD-10 codes ───────────────────────────
        const malnutritionDx = ctx.activeIcd10Codes.filter(c =>
            MALNUTRITION_CODES.some(m => c.startsWith(m)) || WASTING_CODES.some(m => c.startsWith(m))
        );
        if (malnutritionDx.length > 0) {
            score += 30;
            reasons.push(`Active malnutrition diagnosis: ${malnutritionDx.join(', ')}`);
            indicators.malnutritionCodes = malnutritionDx;
        }

        // ── Care plan signals ────────────────────────────────────────────────
        const nutritionFocus = ctx.carePlanFocuses.find(f =>
            f.includes('fluid deficit') || f.includes('nutrition') || f.includes('weight loss')
            || f.includes('supplement') || f.includes('malnutrition')
        );
        if (nutritionFocus) {
            score += 15;
            reasons.push('Active nutrition/fluid care plan focus');
            indicators.carePlanFlag = nutritionFocus.slice(0, 80);
        }

        // ── Determine severity ───────────────────────────────────────────────
        let severity: Severity;
        let priority: string;
        if (score >= 100) {
            severity = 'critical'; priority = 'infuse';
        } else if (score >= 60) {
            severity = 'high'; priority = 'infuse';
        } else if (score >= 30) {
            severity = 'medium'; priority = 'monitor';
        } else if (score > 0) {
            severity = 'low'; priority = 'monitor';
        } else {
            severity = 'normal'; priority = 'none';
        }

        return {
            analysisType: 'infusion',
            severity,
            score,
            priority,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No infusion indicators detected.',
            keyIndicators: indicators,
        };
    },
};
