import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

// ── ICD-10 code sets (prefix-matched) ────────────────────────────────────────
const DIABETES_CODES    = ['E10','E11','E13'];
const CKD_CODES         = ['N18'];
const AKI_CODES         = ['N17'];
const COPD_CODES        = ['J44'];
const ASTHMA_CODES      = ['J45'];
const RESP_FAIL_CODES   = ['J96'];
const HTN_CODES         = ['I10','I11','I12','I13'];
const HF_CODES          = ['I50'];
const DEPRESSION_CODES  = ['F32','F33'];
const ANXIETY_CODES     = ['F41'];
const BIPOLAR_CODES     = ['F31'];
const DEMENTIA_CODES    = ['F01','F02','F03'];
const OSTEO_CODES       = ['M80','M81'];
const GERD_CODES        = ['K21'];
const LIPID_CODES       = ['E78'];
const MALNUT_CODES      = ['E40','E41','E42','E43','E44','E45','E46'];
const STROKE_CODES      = ['I63','I69'];
const SEPSIS_CODES      = ['A40','A41'];
const UTI_CODES         = ['N39'];
const ANEMIA_CODES      = ['D50','D51','D52','D53','D54','D55','D56','D57','D58','D59','D60','D61','D62','D63','D64'];
const THYROID_CODES     = ['E01','E02','E03','E04','E05','E06'];

function hasCode(codes: string[], icd10s: string[]): boolean {
    return icd10s.some(c => codes.some(m => c.startsWith(m)));
}
function hasMed(meds: { name?: string }[], keywords: string[]): boolean {
    return meds.some(m => keywords.some(kw => (m.name ?? '').toLowerCase().includes(kw)));
}

export const primaryCareModule: AnalysisModule = {
    type: 'primary_care',
    name: 'General Medical Review',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];
        const findings: { area: string; concern: string; action: string }[] = [];
        const icd10s = ctx.activeIcd10Codes;
        const meds = ctx.activeMedications;

        // ── 1. Chronic disease burden ────────────────────────────────────────

        const chronicConditions: string[] = [];
        if (hasCode(DIABETES_CODES, icd10s))    chronicConditions.push('Diabetes');
        if (hasCode(CKD_CODES, icd10s))         chronicConditions.push('CKD');
        if (hasCode(COPD_CODES, icd10s))        chronicConditions.push('COPD');
        if (hasCode(ASTHMA_CODES, icd10s))      chronicConditions.push('Asthma');
        if (hasCode(HF_CODES, icd10s))          chronicConditions.push('Heart Failure');
        if (hasCode(DEPRESSION_CODES, icd10s))  chronicConditions.push('Depression');
        if (hasCode(DEMENTIA_CODES, icd10s))    chronicConditions.push('Dementia');
        if (hasCode(STROKE_CODES, icd10s))      chronicConditions.push('Stroke');
        if (hasCode(MALNUT_CODES, icd10s))      chronicConditions.push('Malnutrition');
        if (hasCode(ANEMIA_CODES, icd10s))      chronicConditions.push('Anemia');
        if (hasCode(THYROID_CODES, icd10s))     chronicConditions.push('Thyroid disorder');
        if (hasCode(RESP_FAIL_CODES, icd10s))   chronicConditions.push('Respiratory failure');

        indicators.chronicConditions = chronicConditions.length;
        indicators.chronicList = chronicConditions;

        if (chronicConditions.length >= 6) {
            score += 40;
            findings.push({ area: 'Chronic Complexity', concern: `${chronicConditions.length} major chronic conditions: ${chronicConditions.join(', ')}`, action: 'Consider multidisciplinary care review and care conference' });
            reasons.push(`High chronic disease burden: ${chronicConditions.length} conditions (${chronicConditions.slice(0,3).join(', ')}...)`);
        } else if (chronicConditions.length >= 4) {
            score += 25;
            findings.push({ area: 'Chronic Complexity', concern: `${chronicConditions.length} chronic conditions: ${chronicConditions.join(', ')}`, action: 'Ensure coordinated management plan' });
            reasons.push(`${chronicConditions.length} chronic conditions (${chronicConditions.join(', ')})`);
        } else if (chronicConditions.length >= 2) {
            score += 10;
            reasons.push(`${chronicConditions.length} chronic conditions`);
        }

        // ── 2. Polypharmacy ──────────────────────────────────────────────────

        const medCount = meds.length;
        indicators.medicationCount = medCount;
        if (medCount >= 15) {
            score += 35;
            findings.push({ area: 'Polypharmacy', concern: `${medCount} active medications — high interaction/adverse event risk`, action: 'Pharmacist medication reconciliation and deprescribing review' });
            reasons.push(`Severe polypharmacy: ${medCount} medications`);
        } else if (medCount >= 10) {
            score += 20;
            findings.push({ area: 'Polypharmacy', concern: `${medCount} active medications`, action: 'Review for deprescribing opportunities' });
            reasons.push(`Polypharmacy: ${medCount} medications`);
        } else if (medCount >= 7) {
            score += 10;
            reasons.push(`${medCount} medications`);
        }

        // ── 3. Diabetes management ───────────────────────────────────────────

        const hasDiabetes = hasCode(DIABETES_CODES, icd10s);
        if (hasDiabetes) {
            const a1c = ctx.labs['HBA1C'] ?? ctx.labs['A1C'] ?? ctx.labs['HA1C'] ?? ctx.labs['HEMOGLOBIN A1C'];
            const glucose = ctx.labs['GLU'] ?? ctx.labs['GLUCOSE'];

            if (a1c) {
                indicators.hba1c = a1c.value;
                if (a1c.value > 10.0) {
                    score += 35; reasons.push(`Severely uncontrolled diabetes: A1c ${a1c.value}%`);
                    findings.push({ area: 'Diabetes', concern: `A1c ${a1c.value}% — severe hyperglycemia`, action: 'Urgent medication intensification, endocrine/dietitian referral' });
                } else if (a1c.value > 9.0) {
                    score += 25; reasons.push(`Uncontrolled diabetes: A1c ${a1c.value}%`);
                    findings.push({ area: 'Diabetes', concern: `A1c ${a1c.value}% — above safe range`, action: 'Medication adjustment, dietary review' });
                } else if (a1c.value > 7.5) {
                    score += 10; reasons.push(`Diabetes above target: A1c ${a1c.value}%`);
                }
            } else {
                score += 15;
                findings.push({ area: 'Diabetes', concern: 'Diabetes without A1c on file', action: 'Order HbA1c for glycemic monitoring' });
                reasons.push('Diabetes without A1c on file');
            }

            if (glucose?.value && glucose.value > 300) {
                score += 25; reasons.push(`Glucose critically high: ${glucose.value} mg/dL`);
                findings.push({ area: 'Diabetes', concern: `Glucose ${glucose.value} — acute hyperglycemia`, action: 'Immediate glycemic management' });
                indicators.glucose = glucose.value;
            } else if (glucose?.value && glucose.value < 60) {
                score += 30; reasons.push(`Hypoglycemia: glucose ${glucose.value} mg/dL`);
                findings.push({ area: 'Diabetes', concern: `Glucose ${glucose.value} — hypoglycemia risk`, action: 'Review insulin/sulfonylurea doses, monitor closely' });
            }

            const hasDiabeticMed = hasMed(meds, ['metformin','insulin','glipizide','glimepiride','novolog','lantus','humalog','basaglar','jardiance','ozempic','trulicity','victoza']);
            if (!hasDiabeticMed) {
                score += 15;
                findings.push({ area: 'Diabetes', concern: 'Diabetes without documented diabetic medication', action: 'Verify treatment plan and medication list' });
                reasons.push('Diabetes without diabetic medication on file');
            }
        }

        // ── 4. Renal function ────────────────────────────────────────────────

        const creat = ctx.labs['CREAT'] ?? ctx.labs['CREATININE'];
        const bun   = ctx.labs['BUN'];
        const egfr  = ctx.labs['EGFR'] ?? ctx.labs['EGFR_(NON_AFRICAN-AMERICAN)'];
        const hasCKD = hasCode(CKD_CODES, icd10s);
        const hasAKI = hasCode(AKI_CODES, icd10s);

        if (creat) {
            indicators.creatinine = creat.value;
            if (creat.value > 3.0) {
                score += 35; reasons.push(`Severe renal impairment: Cr ${creat.value}`);
                findings.push({ area: 'Renal', concern: `Creatinine ${creat.value} — severe impairment`, action: 'Urgent nephrology review, adjust renally-cleared medications, hold nephrotoxins' });
            } else if (creat.value > 2.0) {
                score += 20; reasons.push(`Elevated creatinine: ${creat.value} — renal impairment`);
                findings.push({ area: 'Renal', concern: `Creatinine ${creat.value}`, action: 'Monitor renal function, adjust medication doses' });
            } else if (creat.value > 1.5) {
                score += 10; reasons.push(`Creatinine mildly elevated: ${creat.value}`);
            }
        }
        if (egfr && egfr.value < 30) {
            score += 25; reasons.push(`eGFR critically low: ${egfr.value}`);
            findings.push({ area: 'Renal', concern: `eGFR ${egfr.value} — Stage 4-5 CKD`, action: 'Nephrology referral, medication adjustment, avoid nephrotoxins' });
            indicators.egfr = egfr.value;
        } else if (egfr && egfr.value < 45) {
            score += 10; reasons.push(`eGFR low: ${egfr.value}`);
        }
        if (hasAKI && creat && creat.value > 1.5) {
            score += 20; reasons.push('Acute kidney injury with elevated creatinine');
        }

        // ── 5. Electrolyte abnormalities ─────────────────────────────────────

        const k = ctx.labs['K'] ?? ctx.labs['POTASSIUM'];
        const na = ctx.labs['NA'] ?? ctx.labs['SODIUM'];
        const co2 = ctx.labs['CO2'];
        const ca = ctx.labs['CA'] ?? ctx.labs['CALCIUM'];
        const mg = ctx.labs['MG'] ?? ctx.labs['MAGNESIUM'];

        if (k) {
            indicators.potassium = k.value;
            if (k.value > 5.5)      { score += 35; reasons.push(`Hyperkalemia: K ${k.value} — cardiac arrhythmia risk`); findings.push({ area: 'Electrolytes', concern: `K ${k.value}`, action: 'Urgent ECG, treat hyperkalemia, hold ACE/ARB/K supplements' }); }
            else if (k.value > 5.0) { score += 15; reasons.push(`K borderline high: ${k.value}`); }
            else if (k.value < 3.0) { score += 30; reasons.push(`Hypokalemia: K ${k.value} — arrhythmia risk`); findings.push({ area: 'Electrolytes', concern: `K ${k.value} — hypokalemia`, action: 'Potassium replacement, hold diuretics temporarily, monitor cardiac' }); }
            else if (k.value < 3.5) { score += 15; reasons.push(`K borderline low: ${k.value}`); }
        }

        if (na) {
            indicators.sodium = na.value;
            if (na.value < 125)      { score += 35; reasons.push(`Severe hyponatremia: Na ${na.value}`); findings.push({ area: 'Electrolytes', concern: `Na ${na.value} — severe`, action: 'Evaluate cause (SIADH/HF/dehydration), fluid restriction or replacement' }); }
            else if (na.value < 130) { score += 20; reasons.push(`Hyponatremia: Na ${na.value}`); }
            else if (na.value > 150) { score += 20; reasons.push(`Hypernatremia: Na ${na.value}`); findings.push({ area: 'Electrolytes', concern: `Na ${na.value} — hypernatremia`, action: 'Assess hydration, increase free water' }); }
        }

        if (co2 && co2.value < 18) {
            score += 20; reasons.push(`Severe metabolic acidosis: CO2 ${co2.value}`);
            findings.push({ area: 'Electrolytes', concern: `CO2 ${co2.value} — metabolic acidosis`, action: 'Identify cause (sepsis, renal, DKA), treat underlying condition' });
        }
        if (ca && (ca.value < 7.5 || ca.value > 11.0)) {
            score += 20; reasons.push(`Calcium abnormal: ${ca.value}`);
        }
        if (mg && mg.value < 1.2) {
            score += 15; reasons.push(`Hypomagnesemia: Mg ${mg.value}`);
        }

        // ── 6. Respiratory ───────────────────────────────────────────────────

        const hasCOPD = hasCode(COPD_CODES, icd10s);
        const hasRespFail = hasCode(RESP_FAIL_CODES, icd10s);

        if (hasRespFail) {
            score += 35; reasons.push('Chronic respiratory failure with hypoxia');
            findings.push({ area: 'Respiratory', concern: 'Chronic respiratory failure on record', action: 'Ensure O2 target compliance, pulmonology follow-up' });
        }
        if (hasCOPD) {
            const onInhaler = hasMed(meds, ['albuterol','ipratropium','spiriva','tiotropium','breo','advair','symbicort','dulera','formoterol']);
            if (!onInhaler) {
                score += 15;
                findings.push({ area: 'Respiratory', concern: 'COPD without bronchodilator on med list', action: 'Verify inhaler therapy' });
                reasons.push('COPD without inhaler on file');
            } else {
                score += 5;
            }
        }
        const respSignal = ctx.noteSignals.find(s => s.category === 'respiratory');
        if (respSignal) {
            score += 15; reasons.push(`Respiratory concern in notes: ${respSignal.snippet.slice(0,80)}`);
        }

        // ── 7. Infection / acute illness ─────────────────────────────────────

        if (hasCode(SEPSIS_CODES, icd10s)) {
            score += 30; reasons.push('Sepsis diagnosis on record');
            findings.push({ area: 'Infection', concern: 'Sepsis on record', action: 'Verify antibiotic therapy, monitor vitals and lactate, culture results on file' });
        }
        if (hasCode(UTI_CODES, icd10s)) {
            score += 10; reasons.push('UTI on record');
        }

        // WBC elevation
        const wbc = ctx.labs['WBC'];
        if (wbc) {
            indicators.wbc = wbc.value;
            if (wbc.value > 15)      { score += 20; reasons.push(`WBC significantly elevated: ${wbc.value} — possible infection/inflammation`); }
            else if (wbc.value > 11) { score += 10; reasons.push(`WBC mildly elevated: ${wbc.value}`); }
            else if (wbc.value < 3)  { score += 20; reasons.push(`WBC low: ${wbc.value} — neutropenia risk`); }
        }

        // ── 8. BP management ─────────────────────────────────────────────────

        const hasHTN = hasCode(HTN_CODES, icd10s);
        if (ctx.vitals.bloodPressure && hasHTN) {
            const { systolic: s, diastolic: d } = ctx.vitals.bloodPressure;
            indicators.bp = { systolic: s, diastolic: d };
            if (s >= 160 || d >= 100) {
                score += 20; reasons.push(`Poorly controlled HTN: ${s}/${d}`);
                findings.push({ area: 'Hypertension', concern: `BP ${s}/${d} — uncontrolled`, action: 'Medication adjustment, low-sodium diet reinforcement' });
            }
        }

        // ── 9. Mobility / fall risk ───────────────────────────────────────────

        const FALL_CODES = ['R29'];
        if (hasCode(FALL_CODES, icd10s) || ctx.noteSignals.filter(s => s.category === 'fall').length >= 2) {
            score += 15; reasons.push('Fall history documented');
            findings.push({ area: 'Fall Risk', concern: 'Documented falls or fall risk', action: 'PT evaluation, fall prevention protocol, review sedating medications' });
        }

        // ── 10. Pain ─────────────────────────────────────────────────────────

        const painSignal = ctx.noteSignals.find(s => s.category === 'pain');
        if (painSignal || (ctx.vitals.painLevel && ctx.vitals.painLevel.value >= 7)) {
            score += 10; reasons.push('Significant pain documented');
        }

        indicators.findings = findings;
        indicators.findingCount = findings.length;

        const severity: Severity =
            score >= 100 ? 'critical' :
            score >= 60  ? 'high'     :
            score >= 30  ? 'medium'   :
            score > 0    ? 'low'      : 'normal';

        return {
            analysisType: 'primary_care',
            severity,
            score,
            reasoning: reasons.length > 0
                ? reasons.join('. ')
                : 'No significant primary care concerns identified.',
            keyIndicators: indicators,
        };
    },
};
