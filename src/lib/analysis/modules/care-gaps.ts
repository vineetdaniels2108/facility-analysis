import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

const DIABETES_CODES = ['E10', 'E11', 'E13'];
const CKD_CODES = ['N18'];
const ANEMIA_CODES = ['D50', 'D51', 'D52', 'D53', 'D55', 'D56', 'D57', 'D58', 'D59', 'D60', 'D61', 'D62', 'D63', 'D64'];
const THYROID_CODES = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06'];
const LIVER_CODES = ['K70', 'K71', 'K72', 'K73', 'K74'];

interface GapDetail { gap: string; recommendation: string }

export const careGapsModule: AnalysisModule = {
    type: 'care_gaps',
    name: 'Care Gaps & Recommendations',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];
        const gaps: GapDetail[] = [];
        const icd10s = ctx.activeIcd10Codes;

        const hasDiabetes = icd10s.some(c => DIABETES_CODES.some(m => c.startsWith(m)));
        const hasHba1c = !!ctx.labs['HBA1C'] || !!ctx.labs['A1C'] || !!ctx.labs['HEMOGLOBIN A1C'];
        if (hasDiabetes && !hasHba1c) {
            score += 30;
            gaps.push({ gap: 'Diabetes without recent HbA1c', recommendation: 'Order HbA1c for diabetes monitoring' });
            reasons.push('Diabetes dx without HbA1c on file');
        }
        if (hasDiabetes && hasHba1c) {
            const a1c = ctx.labs['HBA1C'] ?? ctx.labs['A1C'] ?? ctx.labs['HEMOGLOBIN A1C'];
            if (a1c && a1c.value > 9.0) {
                score += 25;
                gaps.push({ gap: 'HbA1c uncontrolled: ' + a1c.value + '%', recommendation: 'Medication adjustment and dietary consult needed' });
                reasons.push('HbA1c uncontrolled: ' + a1c.value + '%');
                indicators.hba1c = a1c.value;
            }
        }

        const hasCkd = icd10s.some(c => CKD_CODES.some(m => c.startsWith(m)));
        const hasBun = !!ctx.labs['BUN'];
        const hasCreatinine = !!ctx.labs['CREATININE'] || !!ctx.labs['CREAT'];
        if (hasCkd && (!hasBun || !hasCreatinine)) {
            score += 25;
            gaps.push({ gap: 'CKD without recent BUN/Creatinine', recommendation: 'Order renal panel for CKD monitoring' });
            reasons.push('CKD dx without recent renal labs');
        }

        const hasAnemia = icd10s.some(c => ANEMIA_CODES.some(m => c.startsWith(m)));
        const hasHgb = !!ctx.labs['HGB'];
        if (hasAnemia && !hasHgb) {
            score += 25;
            gaps.push({ gap: 'Anemia diagnosis without recent HGB', recommendation: 'Order CBC to monitor anemia status' });
            reasons.push('Anemia dx without recent CBC');
        }

        const hasThyroid = icd10s.some(c => THYROID_CODES.some(m => c.startsWith(m)));
        const hasTsh = !!ctx.labs['TSH'];
        if (hasThyroid && !hasTsh) {
            score += 20;
            gaps.push({ gap: 'Thyroid disorder without recent TSH', recommendation: 'Order TSH for thyroid monitoring' });
            reasons.push('Thyroid dx without recent TSH');
        }

        const hasLiver = icd10s.some(c => LIVER_CODES.some(m => c.startsWith(m)));
        const hasAlt = !!ctx.labs['ALT'] || !!ctx.labs['SGPT'];
        const hasAst = !!ctx.labs['AST'] || !!ctx.labs['SGOT'];
        if (hasLiver && (!hasAlt || !hasAst)) {
            score += 20;
            gaps.push({ gap: 'Liver disease without recent hepatic panel', recommendation: 'Order LFTs (ALT, AST, bilirubin)' });
            reasons.push('Liver dx without recent LFTs');
        }

        const onAnticoag = ctx.activeMedications.some(m => {
            const name = (m.name ?? '').toLowerCase();
            return name.includes('warfarin') || name.includes('coumadin');
        });
        const hasInr = !!ctx.labs['INR'];
        if (onAnticoag && !hasInr) {
            score += 30;
            gaps.push({ gap: 'On warfarin without recent INR', recommendation: 'Order INR for anticoagulation safety' });
            reasons.push('Warfarin without INR monitoring');
        }

        const conditionCount = ctx.activeConditions.length;
        const carePlanCount = ctx.carePlanFocuses.length;
        if (conditionCount > 5 && carePlanCount < 2) {
            score += 15;
            gaps.push({ gap: conditionCount + ' active conditions with only ' + carePlanCount + ' care plan focuses', recommendation: 'Review and update care plan to address active conditions' });
            reasons.push('Multiple conditions with sparse care plan');
        }

        const hasVitals = Object.values(ctx.vitals).some(v => v != null);
        if (!hasVitals) {
            score += 15;
            gaps.push({ gap: 'No recent vitals recorded', recommendation: 'Ensure routine vital sign monitoring' });
            reasons.push('No recent vitals on file');
        }

        const fallNotes = ctx.noteSignals.filter(s => s.category === 'fall');
        if (fallNotes.length >= 2) {
            const hasFallAssessment = Object.keys(ctx.assessmentScores).some(k =>
                k.toLowerCase().includes('fall') || k.toLowerCase().includes('morse')
            );
            if (!hasFallAssessment) {
                score += 20;
                gaps.push({ gap: fallNotes.length + ' fall events without fall risk assessment', recommendation: 'Complete Morse Fall Scale or equivalent assessment' });
                reasons.push(fallNotes.length + ' falls without risk assessment');
            }
        }

        indicators.gaps = gaps;
        indicators.gapCount = gaps.length;

        const severity: Severity = score >= 80 ? 'critical'
            : score >= 50 ? 'high'
            : score >= 25 ? 'medium'
            : score > 0 ? 'low'
            : 'normal';

        return {
            analysisType: 'care_gaps',
            severity,
            score,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No significant care gaps identified.',
            keyIndicators: indicators,
        };
    },
};
