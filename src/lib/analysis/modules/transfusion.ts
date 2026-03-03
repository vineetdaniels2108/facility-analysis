import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

const ANEMIA_CODES = ['D50', 'D51', 'D52', 'D53', 'D55', 'D56', 'D57', 'D58', 'D59', 'D60', 'D61', 'D62', 'D63', 'D64'];
const BLEEDING_CODES = ['K92.1', 'K92.0', 'K57', 'I85.0'];

export const transfusionModule: AnalysisModule = {
    type: 'transfusion',
    name: 'Transfusion Analysis',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];

        // ── Hemoglobin (primary driver — AABB guidelines) ────────────────────
        // Restrictive: <7 strongly indicated, <8 for cardiac/symptomatic,
        // 8-9 moderate concern, 9-10 mild. >=10 is adequate.
        const hgb = ctx.labs['HGB'];
        if (hgb) {
            indicators.hemoglobin = { value: hgb.value, unit: hgb.unit, trend: hgb.trend };
            if (hgb.value < 7.0) {
                score += 150; reasons.push(`Hemoglobin critically low: ${hgb.value} g/dL — transfusion likely needed`);
            } else if (hgb.value < 8.0) {
                score += 100; reasons.push(`Hemoglobin severely low: ${hgb.value} g/dL`);
            } else if (hgb.value < 9.0) {
                score += 60; reasons.push(`Hemoglobin low: ${hgb.value} g/dL`);
            } else if (hgb.value < 10.0) {
                score += 20; reasons.push(`Hemoglobin mildly low: ${hgb.value} g/dL`);
            }
            if (hgb.trend === 'falling' && hgb.value < 10.0) {
                score += 30; reasons.push('Hemoglobin trending downward');
            }
        }

        // ── Hematocrit ───────────────────────────────────────────────────────
        const hct = ctx.labs['HCT'];
        if (hct) {
            indicators.hematocrit = { value: hct.value, unit: hct.unit };
            if (hct.value < 21) {
                score += 80; reasons.push(`Hematocrit critically low: ${hct.value}%`);
            } else if (hct.value < 24) {
                score += 50; reasons.push(`Hematocrit severely low: ${hct.value}%`);
            } else if (hct.value < 27) {
                score += 25; reasons.push(`Hematocrit low: ${hct.value}%`);
            }
        }

        // ── RBC ──────────────────────────────────────────────────────────────
        const rbc = ctx.labs['RBC'];
        if (rbc && rbc.refLow && rbc.value < rbc.refLow) {
            score += 15;
            reasons.push(`RBC below reference range: ${rbc.value}`);
            indicators.rbc = rbc.value;
        }

        // ── Platelets (for bleeding risk) ────────────────────────────────────
        const plt = ctx.labs['PLT'];
        if (plt) {
            indicators.platelets = plt.value;
            if (plt.value < 50) {
                score += 30; reasons.push(`Platelets critically low: ${plt.value} K/uL — bleeding risk`);
            } else if (plt.value < 100) {
                score += 15; reasons.push(`Platelets low: ${plt.value} K/uL`);
            }
        }

        // ── Anemia diagnoses ─────────────────────────────────────────────────
        const anemiaDx = ctx.activeIcd10Codes.filter(c =>
            ANEMIA_CODES.some(m => c.startsWith(m))
        );
        if (anemiaDx.length > 0) {
            score += 15;
            reasons.push(`Active anemia diagnosis: ${anemiaDx.join(', ')}`);
            indicators.anemiaCodes = anemiaDx;
        }

        // ── Active bleeding codes ─────────────────────────────────────────────
        const bleedingDx = ctx.activeIcd10Codes.filter(c =>
            BLEEDING_CODES.some(m => c.startsWith(m))
        );
        if (bleedingDx.length > 0) {
            score += 20;
            reasons.push(`Active bleeding diagnosis: ${bleedingDx.join(', ')}`);
            indicators.bleedingCodes = bleedingDx;
        }

        // ── Care plan signals ─────────────────────────────────────────────────
        const bloodFocus = ctx.carePlanFocuses.find(f =>
            f.includes('anemia') || f.includes('transfusion') || f.includes('bleeding')
        );
        if (bloodFocus) {
            score += 5;
            reasons.push('Active anemia/transfusion care plan focus');
        }

        // ── Progress note signals ───────────────────────────────────────────
        const bleedingNotes = ctx.noteSignals.filter(s => s.category === 'bleeding');
        if (bleedingNotes.length > 0) {
            score += 15;
            reasons.push(`Progress note: ${bleedingNotes[0].snippet}`);
            indicators.noteSignals = bleedingNotes.length;
        }

        // ── Severity (before gate) ──────────────────────────────────────────
        let severity: Severity;
        let priority: string;
        if (score >= 150) {
            severity = 'critical'; priority = 'transfuse';
        } else if (score >= 80) {
            severity = 'high'; priority = 'evaluate for transfusion';
        } else if (score >= 40) {
            severity = 'medium'; priority = 'monitor closely';
        } else if (score > 0) {
            severity = 'low'; priority = 'monitor';
        } else {
            severity = 'normal'; priority = 'none';
        }

        // ── Hemoglobin gate ─────────────────────────────────────────────────
        // If Hgb is available and adequate, secondary factors (diagnoses,
        // care plans) alone cannot push a patient into high/critical for
        // transfusion. Transfusion is a lab-driven decision.
        if (hgb) {
            if (hgb.value >= 10.0 && severity !== 'normal') {
                severity = 'low';
                priority = 'monitor';
                reasons.push('Hemoglobin adequate (≥10) — transfusion not indicated');
            } else if (hgb.value >= 9.0 && (severity === 'critical' || severity === 'high')) {
                severity = 'medium';
                priority = 'monitor closely';
            }
        }

        return {
            analysisType: 'transfusion',
            severity,
            score,
            priority,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No transfusion indicators detected.',
            keyIndicators: indicators,
        };
    },
};
