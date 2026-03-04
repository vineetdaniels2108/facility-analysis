import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

const DIABETES_CODES = ['E10', 'E11', 'E13'];
const CKD_CODES = ['N18'];
const COPD_CODES = ['J44'];
const ASTHMA_CODES = ['J45'];
const OSTEOPOROSIS_CODES = ['M80', 'M81'];
const DEPRESSION_CODES = ['F32', 'F33'];
const HYPERTENSION_CODES = ['I10', 'I11', 'I12', 'I13'];

export const primaryCareModule: AnalysisModule = {
    type: 'primary_care',
    name: 'Primary Care Analysis',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];
        const icd10s = ctx.activeIcd10Codes;
        const findings: { area: string; concern: string; action: string }[] = [];

        const medNames = ctx.activeMedications.map(m => (m.name ?? '').toLowerCase());

        // Chronic disease burden
        const chronicCount = [
            DIABETES_CODES, CKD_CODES, COPD_CODES, ASTHMA_CODES,
            OSTEOPOROSIS_CODES, DEPRESSION_CODES, HYPERTENSION_CODES,
        ].filter(codes => icd10s.some(c => codes.some(m => c.startsWith(m)))).length;

        if (chronicCount >= 5) {
            score += 30;
            findings.push({ area: 'Chronic Disease Burden', concern: `${chronicCount} chronic conditions — complex management`, action: 'Consider multidisciplinary team review' });
            reasons.push(`${chronicCount} chronic conditions (high complexity)`);
        } else if (chronicCount >= 3) {
            score += 15;
            findings.push({ area: 'Chronic Disease Burden', concern: `${chronicCount} chronic conditions`, action: 'Ensure coordinated management' });
            reasons.push(`${chronicCount} chronic conditions`);
        }
        indicators.chronicConditions = chronicCount;

        // Polypharmacy
        const medCount = ctx.activeMedications.length;
        if (medCount >= 15) {
            score += 30;
            findings.push({ area: 'Polypharmacy', concern: `${medCount} active medications — high interaction risk`, action: 'Pharmacist medication reconciliation recommended' });
            reasons.push(`${medCount} medications (severe polypharmacy)`);
        } else if (medCount >= 10) {
            score += 20;
            findings.push({ area: 'Polypharmacy', concern: `${medCount} active medications`, action: 'Review for deprescribing opportunities' });
            reasons.push(`${medCount} medications (polypharmacy)`);
        } else if (medCount >= 7) {
            score += 10;
            reasons.push(`${medCount} medications`);
        }
        indicators.medicationCount = medCount;

        // Diabetes management
        const hasDiabetes = icd10s.some(c => DIABETES_CODES.some(m => c.startsWith(m)));
        if (hasDiabetes) {
            const a1c = ctx.labs['HBA1C'] ?? ctx.labs['A1C'] ?? ctx.labs['HEMOGLOBIN A1C'];
            const glucose = ctx.labs['GLUCOSE'] ?? ctx.labs['GLU'];

            if (a1c && a1c.value > 9.0) {
                score += 25;
                findings.push({ area: 'Diabetes', concern: `HbA1c ${a1c.value}% — uncontrolled`, action: 'Intensify glycemic management, consider endocrine referral' });
                reasons.push(`Uncontrolled diabetes: A1c ${a1c.value}%`);
            } else if (a1c && a1c.value > 7.5) {
                score += 10;
                findings.push({ area: 'Diabetes', concern: `HbA1c ${a1c.value}% — above target`, action: 'Medication adjustment may be needed' });
            }

            if (glucose && glucose.value > 300) {
                score += 20;
                findings.push({ area: 'Diabetes', concern: `Blood glucose ${glucose.value} — significantly elevated`, action: 'Acute glycemic management needed' });
                reasons.push(`Blood glucose critically high: ${glucose.value}`);
            }

            if (hasDiabetes && !medNames.some(n => n.includes('metformin') || n.includes('insulin') || n.includes('glipizide') || n.includes('novolog') || n.includes('lantus'))) {
                score += 15;
                findings.push({ area: 'Diabetes', concern: 'Diabetes without diabetic medication', action: 'Verify diabetes medication plan' });
                reasons.push('Diabetes dx without diabetic medications');
            }
        }

        // Renal function
        const creat = ctx.labs['CREATININE'] ?? ctx.labs['CREAT'];
        const bun = ctx.labs['BUN'];
        if (creat && creat.value > 2.0) {
            score += 20;
            findings.push({ area: 'Renal', concern: `Creatinine elevated: ${creat.value}`, action: 'Monitor renal function, adjust renally-cleared medications' });
            reasons.push(`Creatinine elevated: ${creat.value}`);
            indicators.creatinine = creat.value;
        }
        if (bun && bun.value > 30) {
            score += 10;
            reasons.push(`BUN elevated: ${bun.value}`);
            indicators.bun = bun.value;
        }

        // Electrolyte abnormalities
        const potassium = ctx.labs['K'] ?? ctx.labs['POTASSIUM'];
        if (potassium) {
            if (potassium.value > 5.5) {
                score += 30; reasons.push(`Potassium critically high: ${potassium.value}`);
                findings.push({ area: 'Electrolytes', concern: `Hyperkalemia: ${potassium.value}`, action: 'Urgent intervention — ECG and treatment' });
            } else if (potassium.value < 3.0) {
                score += 25; reasons.push(`Potassium critically low: ${potassium.value}`);
                findings.push({ area: 'Electrolytes', concern: `Hypokalemia: ${potassium.value}`, action: 'Potassium replacement, monitor cardiac' });
            }
            indicators.potassium = potassium.value;
        }

        const sodium = ctx.labs['NA'] ?? ctx.labs['SODIUM'];
        if (sodium) {
            if (sodium.value < 125) {
                score += 25; reasons.push(`Sodium critically low: ${sodium.value}`);
                findings.push({ area: 'Electrolytes', concern: `Severe hyponatremia: ${sodium.value}`, action: 'Evaluate cause, fluid restriction, monitor neurological' });
            } else if (sodium.value > 150) {
                score += 20; reasons.push(`Sodium elevated: ${sodium.value}`);
                findings.push({ area: 'Electrolytes', concern: `Hypernatremia: ${sodium.value}`, action: 'Evaluate hydration status' });
            }
            indicators.sodium = sodium.value;
        }

        // Blood pressure management
        if (ctx.vitals.bloodPressure) {
            const { systolic, diastolic } = ctx.vitals.bloodPressure;
            const hasHtn = icd10s.some(c => HYPERTENSION_CODES.some(m => c.startsWith(m)));
            if (hasHtn && systolic >= 160) {
                score += 15;
                findings.push({ area: 'Hypertension', concern: `BP ${systolic}/${diastolic} despite HTN dx`, action: 'Medication adjustment for blood pressure control' });
                reasons.push(`Uncontrolled HTN: ${systolic}/${diastolic}`);
            }
        }

        indicators.findings = findings;
        indicators.findingCount = findings.length;

        const severity: Severity = score >= 100 ? 'critical'
            : score >= 60 ? 'high'
            : score >= 30 ? 'medium'
            : score > 0 ? 'low'
            : 'normal';

        return {
            analysisType: 'primary_care',
            severity,
            score,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No significant primary care concerns.',
            keyIndicators: indicators,
        };
    },
};
