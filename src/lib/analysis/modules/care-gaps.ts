import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

// ── ICD-10 code sets ──────────────────────────────────────────────────────────
const DIABETES_CODES    = ['E10','E11','E13'];
const CKD_CODES         = ['N18'];
const AKI_CODES         = ['N17'];
const ANEMIA_CODES      = ['D50','D51','D52','D53','D54','D55','D56','D57','D58','D59','D60','D61','D62','D63','D64'];
const THYROID_CODES     = ['E01','E02','E03','E04','E05','E06'];
const LIVER_CODES       = ['K70','K71','K72','K73','K74'];
const HF_CODES          = ['I50'];
const AFIB_CODES        = ['I48'];
const HTN_CODES         = ['I10','I11','I12','I13'];
const DEPRESSION_CODES  = ['F32','F33'];
const DEMENTIA_CODES    = ['F01','F02','F03'];
const COPD_CODES        = ['J44'];
const MALNUT_CODES      = ['E40','E41','E42','E43','E44','E45','E46'];
const LIPID_CODES       = ['E78'];
const OSTEO_CODES       = ['M80','M81'];
const UTI_CODES         = ['N39'];
const FALL_CODES        = ['R29'];
const DYSPHAGIA_CODES   = ['R13'];
const SEPSIS_CODES      = ['A40','A41'];

function hasCode(codes: string[], icd10s: string[]): boolean {
    return icd10s.some(c => codes.some(m => c.startsWith(m)));
}

interface GapDetail { gap: string; recommendation: string; priority: 'urgent' | 'routine' }

export const careGapsModule: AnalysisModule = {
    type: 'care_gaps',
    name: 'Care Gaps & Recommendations',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];
        const gaps: GapDetail[] = [];
        const icd10s = ctx.activeIcd10Codes;
        const meds = ctx.activeMedications;

        function hasMed(keywords: string[]): boolean {
            return meds.some(m => keywords.some(kw => (m.name ?? '').toLowerCase().includes(kw)));
        }

        // ── 1. Diabetes monitoring ────────────────────────────────────────────

        const hasDiabetes = hasCode(DIABETES_CODES, icd10s);
        if (hasDiabetes) {
            const hasA1c = !!(ctx.labs['HBA1C'] ?? ctx.labs['A1C'] ?? ctx.labs['HA1C'] ?? ctx.labs['HEMOGLOBIN A1C']);
            if (!hasA1c) {
                score += 30;
                gaps.push({ gap: 'Diabetes without HbA1c', recommendation: 'Order HbA1c for diabetes monitoring', priority: 'urgent' });
                reasons.push('Diabetes without HbA1c on file');
            } else {
                const a1c = ctx.labs['HBA1C'] ?? ctx.labs['A1C'] ?? ctx.labs['HA1C'];
                if (a1c && a1c.value > 9.0) {
                    score += 25;
                    gaps.push({ gap: `HbA1c ${a1c.value}% — uncontrolled`, recommendation: 'Medication adjustment, dietary consult, and endocrine referral', priority: 'urgent' });
                    reasons.push(`HbA1c uncontrolled: ${a1c.value}%`);
                    indicators.hba1c = a1c.value;
                }
            }

            // Diabetes without any diabetic medication
            const hasDmMed = hasMed(['metformin','insulin','glipizide','glimepiride','novolog','lantus','humalog','basaglar','jardiance','ozempic','trulicity','victoza','byetta','tradjenta']);
            if (!hasDmMed) {
                score += 20;
                gaps.push({ gap: 'Diabetes without diabetic medication on file', recommendation: 'Verify current treatment plan and reconcile medication list', priority: 'urgent' });
                reasons.push('Diabetes dx without diabetic medication');
            }
        }

        // ── 2. Renal monitoring ───────────────────────────────────────────────

        const hasCKD = hasCode(CKD_CODES, icd10s);
        const hasAKI = hasCode(AKI_CODES, icd10s);
        const hasBun  = !!(ctx.labs['BUN']);
        const hasCreat = !!(ctx.labs['CREAT'] ?? ctx.labs['CREATININE']);

        if ((hasCKD || hasAKI) && (!hasBun || !hasCreat)) {
            score += 25;
            gaps.push({ gap: 'CKD/AKI without recent BUN/Creatinine', recommendation: 'Order comprehensive renal panel for monitoring', priority: 'urgent' });
            reasons.push('Renal diagnosis without recent renal labs');
        }

        // High creatinine without CKD diagnosis = possible under-coding
        const creat = ctx.labs['CREAT'] ?? ctx.labs['CREATININE'];
        if (creat && creat.value > 2.0 && !hasCKD && !hasAKI) {
            score += 20;
            gaps.push({ gap: `Creatinine ${creat.value} without CKD/AKI diagnosis`, recommendation: 'Evaluate for CKD diagnosis coding, nephrology referral if persistent', priority: 'urgent' });
            reasons.push(`Elevated creatinine (${creat.value}) without renal diagnosis`);
        }

        // ── 3. Anemia monitoring ──────────────────────────────────────────────

        const hasAnemia = hasCode(ANEMIA_CODES, icd10s);
        const hasHgb = !!(ctx.labs['HGB']);
        if (hasAnemia && !hasHgb) {
            score += 25;
            gaps.push({ gap: 'Anemia without recent CBC/HGB', recommendation: 'Order CBC to monitor anemia status', priority: 'urgent' });
            reasons.push('Anemia without recent CBC');
        }
        if (hasAnemia && hasHgb) {
            const hgb = ctx.labs['HGB'];
            if (hgb && hgb.value < 8.0) {
                score += 25;
                gaps.push({ gap: `HGB ${hgb.value} — severe anemia unaddressed`, recommendation: 'Evaluate cause, consider transfusion if symptomatic, iron studies', priority: 'urgent' });
                reasons.push(`Severe anemia: HGB ${hgb.value}`);
                indicators.hgb = hgb.value;
            }
        }

        // ── 4. Anticoagulation monitoring ─────────────────────────────────────

        const onWarfarin = hasMed(['warfarin','coumadin']);
        const hasInr = !!(ctx.labs['INR']);
        if (onWarfarin && !hasInr) {
            score += 35;
            gaps.push({ gap: 'Warfarin without recent INR', recommendation: 'Order INR — anticoagulation safety monitoring gap', priority: 'urgent' });
            reasons.push('Warfarin without INR monitoring');
        }
        if (onWarfarin && hasInr) {
            const inr = ctx.labs['INR']!;
            if (inr.value > 4.0) {
                score += 30;
                gaps.push({ gap: `INR ${inr.value} — supratherapeutic, bleeding risk`, recommendation: 'Hold warfarin dose, consider vitamin K, recheck INR in 24-48h', priority: 'urgent' });
                reasons.push(`INR dangerously elevated: ${inr.value}`);
            } else if (inr.value < 1.5) {
                score += 20;
                gaps.push({ gap: `INR ${inr.value} — sub-therapeutic on warfarin`, recommendation: 'Review warfarin dose, check compliance and dietary interactions', priority: 'urgent' });
                reasons.push(`INR sub-therapeutic: ${inr.value}`);
            }
            indicators.inr = inr.value;
        }

        // AFib without anticoagulation
        const onAnyAnticoag = hasMed(['warfarin','coumadin','eliquis','apixaban','xarelto','rivaroxaban','pradaxa','dabigatran']);
        if (hasCode(AFIB_CODES, icd10s) && !onAnyAnticoag) {
            score += 30;
            gaps.push({ gap: 'Atrial fibrillation without anticoagulation', recommendation: 'Assess CHA₂DS₂-VASc score; consider anticoagulation to prevent stroke', priority: 'urgent' });
            reasons.push('AFib without anticoagulation');
        }

        // ── 5. Thyroid monitoring ─────────────────────────────────────────────

        const hasThyroid = hasCode(THYROID_CODES, icd10s);
        const hasTsh = !!(ctx.labs['TSH']);
        if (hasThyroid && !hasTsh) {
            score += 20;
            gaps.push({ gap: 'Thyroid disorder without recent TSH', recommendation: 'Order TSH for thyroid function monitoring', priority: 'routine' });
            reasons.push('Thyroid disorder without TSH on file');
        }

        // On levothyroxine without TSH
        const onThyroidMed = hasMed(['levothyroxine','synthroid','armour thyroid','liothyronine']);
        if (onThyroidMed && !hasTsh) {
            score += 20;
            gaps.push({ gap: 'On thyroid medication without TSH on file', recommendation: 'Order TSH to verify dose adequacy', priority: 'urgent' });
            reasons.push('Thyroid medication without TSH monitoring');
        }

        // ── 6. Liver disease monitoring ───────────────────────────────────────

        const hasLiver = hasCode(LIVER_CODES, icd10s);
        const hasAlt = !!(ctx.labs['ALT'] ?? ctx.labs['ALT_(SGPT)']);
        const hasAst = !!(ctx.labs['AST'] ?? ctx.labs['AST_(SGOT)']);
        if (hasLiver && (!hasAlt || !hasAst)) {
            score += 20;
            gaps.push({ gap: 'Liver disease without LFTs on file', recommendation: 'Order hepatic panel (ALT, AST, bilirubin)', priority: 'routine' });
            reasons.push('Liver diagnosis without LFTs');
        }

        // Amiodarone without LFTs / thyroid
        const onAmio = hasMed(['amiodarone']);
        if (onAmio && (!hasAlt || !hasTsh)) {
            score += 25;
            gaps.push({ gap: 'On amiodarone without LFT/TSH monitoring', recommendation: 'Order LFTs and TSH — amiodarone can cause hepatotoxicity and thyroid dysfunction', priority: 'urgent' });
            reasons.push('Amiodarone without liver/thyroid monitoring');
        }

        // ── 7. Malnutrition / nutritional gaps ───────────────────────────────

        const hasMalnut = hasCode(MALNUT_CODES, icd10s);
        const hasDysphagia = hasCode(DYSPHAGIA_CODES, icd10s);
        const hasAlb = !!(ctx.labs['ALB']);

        if ((hasMalnut || hasDysphagia) && !hasAlb) {
            score += 20;
            gaps.push({ gap: 'Malnutrition/dysphagia without albumin on file', recommendation: 'Order albumin/prealbumin for nutritional status assessment', priority: 'routine' });
            reasons.push('Nutritional diagnosis without albumin');
        }
        if (hasMalnut) {
            const alb = ctx.labs['ALB'];
            if (alb && alb.value < 3.0) {
                score += 20;
                gaps.push({ gap: `Malnutrition with albumin ${alb.value} — unaddressed`, recommendation: 'Dietitian consult, consider nutritional supplements or enteral nutrition', priority: 'urgent' });
                reasons.push(`Malnutrition with low albumin: ${alb.value}`);
            }
        }

        // ── 8. Lipid monitoring on statin ─────────────────────────────────────

        const onStatin = hasMed(['atorvastatin','rosuvastatin','simvastatin','pravastatin','lovastatin','pitavastatin','fluvastatin']);
        const hasLipidLab = !!(ctx.labs['CHOLESTEROL'] ?? ctx.labs['LDL'] ?? ctx.labs['CALCULATED_LDL'] ?? ctx.labs['TRIGLYCERIDES']);
        if (onStatin && !hasLipidLab) {
            score += 15;
            gaps.push({ gap: 'On statin without lipid panel on file', recommendation: 'Order lipid panel to assess statin efficacy', priority: 'routine' });
            reasons.push('Statin without lipid monitoring');
        }

        // ── 9. Care plan completeness ─────────────────────────────────────────

        const activeConditionCount = icd10s.length;
        const carePlanCount = ctx.carePlanFocuses.length;
        if (activeConditionCount > 6 && carePlanCount < 3) {
            score += 20;
            gaps.push({ gap: `${activeConditionCount} active conditions with only ${carePlanCount} care plan focuses`, recommendation: 'Care plan conference to address all active conditions', priority: 'routine' });
            reasons.push('Multiple diagnoses with sparse care plan');
        }

        // ── 10. Vitals / fall risk ────────────────────────────────────────────

        const hasVitals = Object.values(ctx.vitals).some(v => v != null);
        if (!hasVitals && activeConditionCount >= 3) {
            score += 15;
            gaps.push({ gap: 'No recent vitals recorded for a complex patient', recommendation: 'Ensure routine vital sign monitoring (BP, pulse, SpO2, weight)', priority: 'routine' });
            reasons.push('No vitals on file');
        }

        const fallNoteCount = ctx.noteSignals.filter(s => s.category === 'fall').length;
        const hasFallDx = hasCode(FALL_CODES, icd10s);
        if ((fallNoteCount >= 2 || hasFallDx) ) {
            const hasFallAssessment = Object.keys(ctx.assessmentScores).some(k =>
                k.toLowerCase().includes('fall') || k.toLowerCase().includes('morse')
            );
            if (!hasFallAssessment) {
                score += 20;
                gaps.push({ gap: 'Fall events/diagnosis without formal fall risk assessment', recommendation: 'Complete Morse Fall Scale or equivalent; implement fall prevention protocol', priority: 'urgent' });
                reasons.push('Falls documented without fall risk assessment');
            }
        }

        // ── 11. Depression screening ──────────────────────────────────────────

        const hasDepression = hasCode(DEPRESSION_CODES, icd10s);
        if (hasDepression) {
            const hasPhq = Object.keys(ctx.assessmentScores).some(k =>
                k.toLowerCase().includes('phq') || k.toLowerCase().includes('depression') || k.toLowerCase().includes('geriatric depression')
            );
            const onAntidepressant = hasMed(['fluoxetine','sertraline','escitalopram','citalopram','paroxetine','venlafaxine','duloxetine','bupropion','mirtazapine']);
            if (!hasPhq && !onAntidepressant) {
                score += 15;
                gaps.push({ gap: 'Depression diagnosis without PHQ screening or antidepressant', recommendation: 'Complete PHQ-9, review treatment plan', priority: 'routine' });
                reasons.push('Depression without treatment documentation');
            }
        }

        // ── 12. Heart failure monitoring ─────────────────────────────────────

        const hasHF = hasCode(HF_CODES, icd10s);
        if (hasHF) {
            const onDiuretic = hasMed(['furosemide','lasix','torsemide','bumetanide','spironolactone','metolazone']);
            const bnp = ctx.labs['BNP'] ?? ctx.labs['NT-PROBNP'];
            if (!onDiuretic) {
                score += 20;
                gaps.push({ gap: 'Heart failure without diuretic', recommendation: 'Verify fluid management plan; most HF patients require diuretics', priority: 'urgent' });
                reasons.push('HF without diuretic');
            }
            if (!bnp) {
                score += 15;
                gaps.push({ gap: 'Heart failure without BNP/NT-proBNP', recommendation: 'Order BNP for HF monitoring and baseline', priority: 'routine' });
                reasons.push('HF without BNP on file');
            }
        }

        indicators.gaps = gaps;
        indicators.gapCount = gaps.length;
        indicators.urgentGaps = gaps.filter(g => g.priority === 'urgent').length;

        const severity: Severity =
            score >= 80 ? 'critical' :
            score >= 50 ? 'high'     :
            score >= 25 ? 'medium'   :
            score > 0   ? 'low'      : 'normal';

        return {
            analysisType: 'care_gaps',
            severity,
            score,
            reasoning: reasons.length > 0
                ? reasons.join('. ')
                : 'No significant care gaps identified.',
            keyIndicators: indicators,
        };
    },
};
