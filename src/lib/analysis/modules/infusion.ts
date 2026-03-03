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

        // ── Albumin (primary driver) ────────────────────────────────────────
        // Normal range: 3.5-5.0 g/dL. Clinical malnutrition thresholds:
        // <3.5 mild, <3.0 moderate, <2.5 severe, <2.0 critical.
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
                score += 10; reasons.push(`Albumin borderline: ${alb.value} g/dL`);
            }
            if (alb.trend === 'falling' && alb.value < 3.5) {
                score += 20; reasons.push('Albumin trending down');
            }
        }

        // ── Prealbumin (short-term nutritional marker) ──────────────────────
        const prealb = ctx.labs['PREALB'];
        if (prealb) {
            indicators.prealbumin = { value: prealb.value, unit: prealb.unit, trend: prealb.trend };
            if (prealb.value < 5) {
                score += 80; reasons.push(`Prealbumin critically low: ${prealb.value} mg/dL`);
            } else if (prealb.value < 10) {
                score += 50; reasons.push(`Prealbumin severely low: ${prealb.value} mg/dL`);
            } else if (prealb.value < 15) {
                score += 20; reasons.push(`Prealbumin low: ${prealb.value} mg/dL`);
            }
            if (prealb.trend === 'falling' && prealb.value < 15) {
                score += 15; reasons.push('Prealbumin trending down');
            }
        }

        // ── Total Protein ────────────────────────────────────────────────────
        const tprot = ctx.labs['TPROT'];
        if (tprot && tprot.value < 5.5) {
            score += 25;
            reasons.push(`Total protein low: ${tprot.value} g/dL`);
            indicators.totalProtein = tprot.value;
        }

        // ── Conditions: malnutrition ICD-10 codes ───────────────────────────
        const malnutritionDx = ctx.activeIcd10Codes.filter(c =>
            MALNUTRITION_CODES.some(m => c.startsWith(m)) || WASTING_CODES.some(m => c.startsWith(m))
        );
        if (malnutritionDx.length > 0) {
            score += 20;
            reasons.push(`Active malnutrition diagnosis: ${malnutritionDx.join(', ')}`);
            indicators.malnutritionCodes = malnutritionDx;
        }

        // ── Care plan signals ────────────────────────────────────────────────
        const nutritionFocus = ctx.carePlanFocuses.find(f =>
            f.includes('fluid deficit') || f.includes('nutrition') || f.includes('weight loss')
            || f.includes('supplement') || f.includes('malnutrition')
        );
        if (nutritionFocus) {
            score += 10;
            reasons.push('Active nutrition/fluid care plan focus');
            indicators.carePlanFlag = nutritionFocus.slice(0, 80);
        }

        // ── Progress note signals ───────────────────────────────────────────
        const nutritionNotes = ctx.noteSignals.filter(s => s.category === 'nutrition');
        if (nutritionNotes.length > 0) {
            score += 15;
            reasons.push(`Progress note: ${nutritionNotes[0].snippet}`);
            indicators.noteSignals = nutritionNotes.length;
        }

        // ── Determine severity (before gate) ────────────────────────────────
        let severity: Severity;
        let priority: string;
        if (score >= 100) {
            severity = 'critical'; priority = 'infuse';
        } else if (score >= 60) {
            severity = 'high'; priority = 'evaluate for infusion';
        } else if (score >= 30) {
            severity = 'medium'; priority = 'monitor closely';
        } else if (score > 0) {
            severity = 'low'; priority = 'monitor';
        } else {
            severity = 'normal'; priority = 'none';
        }

        // ── Lab gate ────────────────────────────────────────────────────────
        // Infusion is a lab-driven decision. If primary nutritional markers
        // (albumin + prealbumin) are adequate, secondary factors (diagnoses,
        // care plans) alone cannot push a patient to high/critical.
        const albNormal = alb && alb.value >= 3.5;
        const prealbNormal = !prealb || prealb.value >= 15;

        if (albNormal && prealbNormal && severity !== 'normal') {
            severity = 'low';
            priority = 'monitor';
            reasons.push('Albumin adequate (≥3.5) — infusion not indicated');
        } else if (alb && alb.value >= 3.0 && prealbNormal) {
            if (severity === 'critical' || severity === 'high') {
                severity = 'medium';
                priority = 'monitor closely';
            }
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
