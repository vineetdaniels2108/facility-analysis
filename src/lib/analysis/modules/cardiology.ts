import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

// ── ICD-10 code sets (prefix-matched) ────────────────────────────────────────
const HF_CODES          = ['I50'];                                       // Heart failure
const CAD_CODES         = ['I25'];                                       // Chronic ischemic heart disease
const AFIB_CODES        = ['I48'];                                       // Atrial fibrillation/flutter
const MI_CODES          = ['I21','I22','I23','I24'];                     // Acute/recent MI
const STROKE_CODES      = ['I63','I69'];                                 // Stroke / stroke sequelae
const HTN_CODES         = ['I10','I11','I12','I13','I15'];              // Hypertension
const VALVE_CODES       = ['I34','I35','I36','I37','I38'];              // Valvular disease
const CARDIOMYOPATHY    = ['I42','I43'];                                 // Cardiomyopathy
const DVT_PE_CODES      = ['I26','I80','I82'];                          // DVT/PE
const PAD_CODES         = ['I70','I73'];                                 // Peripheral artery disease
const CARDIAC_ARREST    = ['I46'];                                       // Cardiac arrest history

// ── Medication keywords ──────────────────────────────────────────────────────
const ANTICOAG_KW  = ['warfarin','coumadin','eliquis','apixaban','xarelto','rivaroxaban','pradaxa','dabigatran'];
const DIURETIC_KW  = ['furosemide','lasix','torsemide','bumetanide','spironolactone','metolazone'];
const ACE_ARB_KW   = ['lisinopril','enalapril','ramipril','captopril','losartan','valsartan','irbesartan','olmesartan','telmisartan'];
const BB_KW        = ['metoprolol','carvedilol','atenolol','bisoprolol','nebivolol'];
const AMIO_KW      = ['amiodarone','sotalol','dofetilide','flecainide'];
const DIGOXIN_KW   = ['digoxin'];
const STATIN_KW    = ['atorvastatin','rosuvastatin','simvastatin','pravastatin'];
const NITRATE_KW   = ['nitroglycerin','isosorbide'];

function hasMed(meds: { name?: string }[], keywords: string[]): boolean {
    return meds.some(m => keywords.some(kw => (m.name ?? '').toLowerCase().includes(kw)));
}

function hasCode(codes: string[], icd10s: string[]): boolean {
    return icd10s.some(c => codes.some(m => c.startsWith(m)));
}

export const cardiologyModule: AnalysisModule = {
    type: 'cardiology',
    name: 'Cardiac Risk & Monitoring',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];
        const gaps: string[] = [];       // monitoring gaps detected
        const icd10s = ctx.activeIcd10Codes;
        const meds = ctx.activeMedications;

        // ── 1. Primary cardiac diagnoses ─────────────────────────────────────

        const hasHF  = hasCode(HF_CODES, icd10s);
        const hasCAD = hasCode(CAD_CODES, icd10s);
        const hasAfib = hasCode(AFIB_CODES, icd10s);
        const hasMI  = hasCode(MI_CODES, icd10s);

        if (hasHF)   { score += 50; reasons.push('Heart failure diagnosis'); indicators.heartFailure = true; }
        if (hasCAD)  { score += 35; reasons.push('Coronary artery disease'); indicators.cad = true; }
        if (hasAfib) { score += 30; reasons.push('Atrial fibrillation'); indicators.afib = true; }
        if (hasMI)   { score += 40; reasons.push('Recent/prior MI'); indicators.mi = true; }

        if (hasCode(VALVE_CODES, icd10s))      { score += 25; reasons.push('Valvular heart disease'); }
        if (hasCode(CARDIOMYOPATHY, icd10s))   { score += 30; reasons.push('Cardiomyopathy'); }
        if (hasCode(DVT_PE_CODES, icd10s))     { score += 25; reasons.push('DVT/PE history'); indicators.dvtPe = true; }
        if (hasCode(STROKE_CODES, icd10s))     { score += 25; reasons.push('Stroke/TIA history'); indicators.stroke = true; }
        if (hasCode(PAD_CODES, icd10s))        { score += 15; reasons.push('Peripheral artery disease'); }
        if (hasCode(CARDIAC_ARREST, icd10s))   { score += 40; reasons.push('History of cardiac arrest'); }

        // HTN: only add score if poorly controlled or combined with other cardiac
        const hasHTN = hasCode(HTN_CODES, icd10s);
        if (hasHTN && (hasHF || hasCAD || hasAfib)) {
            score += 15; reasons.push('Hypertension with concurrent cardiac disease');
        } else if (hasHTN) {
            score += 5;
        }
        indicators.hypertension = hasHTN;

        // ── 2. Key lab markers ───────────────────────────────────────────────

        // BNP / NT-proBNP — most important for HF monitoring
        const bnp = ctx.labs['BNP'] ?? ctx.labs['NT-PROBNP'] ?? ctx.labs['NTPROBNP'] ?? ctx.labs['NT_PROBNP'];
        if (bnp) {
            indicators.bnp = { value: bnp.value, unit: bnp.unit };
            if (bnp.value > 900)      { score += 50; reasons.push(`BNP critically elevated: ${bnp.value} ${bnp.unit} — decompensated HF`); }
            else if (bnp.value > 400) { score += 30; reasons.push(`BNP elevated: ${bnp.value} ${bnp.unit}`); }
            else if (bnp.value > 100) { score += 10; reasons.push(`BNP mildly elevated: ${bnp.value} ${bnp.unit}`); }
        } else if (hasHF) {
            // BNP not on file for a HF patient = monitoring gap
            score += 10;
            gaps.push('Heart failure without recent BNP on file — order BNP');
        }

        // Troponin
        const trop = ctx.labs['TROPONIN'] ?? ctx.labs['TROPONIN_I'] ?? ctx.labs['TROPONIN I'] ?? ctx.labs['TROP'];
        if (trop?.isAbnormal) {
            score += 40; reasons.push(`Troponin elevated: ${trop.value} ${trop.unit}`);
            indicators.troponin = trop.value;
        }

        // INR — critical for warfarin patients
        const inr = ctx.labs['INR'];
        const onWarfarin = hasMed(meds, ['warfarin','coumadin']);
        if (inr) {
            indicators.inr = inr.value;
            if (inr.value > 4.0) {
                score += 40; reasons.push(`INR dangerously elevated: ${inr.value} — major bleeding risk`);
            } else if (inr.value > 3.5) {
                score += 20; reasons.push(`INR supratherapeutic: ${inr.value}`);
            } else if (inr.value < 1.5 && onWarfarin) {
                score += 20; reasons.push(`INR sub-therapeutic: ${inr.value} on warfarin — clot risk`);
            }
        } else if (onWarfarin) {
            score += 25;
            gaps.push('On warfarin without recent INR — anticoagulation monitoring gap');
        }

        // Potassium — critical on diuretics / digoxin
        const k = ctx.labs['K'] ?? ctx.labs['POTASSIUM'];
        if (k) {
            indicators.potassium = k.value;
            if (k.value > 5.5)      { score += 30; reasons.push(`Hyperkalemia: K ${k.value} — risk on ACE/ARB/spironolactone`); }
            else if (k.value > 5.0) { score += 15; reasons.push(`K borderline high: ${k.value}`); }
            else if (k.value < 3.0) { score += 30; reasons.push(`Hypokalemia: K ${k.value} — arrhythmia risk`); }
            else if (k.value < 3.5) { score += 15; reasons.push(`K borderline low: ${k.value}`); }
        }

        // Sodium — HF fluid status marker
        const na = ctx.labs['NA'] ?? ctx.labs['SODIUM'];
        if (na) {
            indicators.sodium = na.value;
            if (na.value < 130) { score += 25; reasons.push(`Hyponatremia: Na ${na.value} — fluid overload/HF`); }
            else if (na.value < 134) { score += 10; reasons.push(`Na borderline low: ${na.value}`); }
        }

        // Creatinine — renal function affects drug dosing
        const creat = ctx.labs['CREAT'] ?? ctx.labs['CREATININE'];
        if (creat && creat.value > 2.0) {
            score += 15; reasons.push(`Elevated creatinine: ${creat.value} — affects cardiac drug dosing`);
            indicators.creatinine = creat.value;
        }

        // ── 3. Vital signs ───────────────────────────────────────────────────

        if (ctx.vitals.bloodPressure) {
            const { systolic: s, diastolic: d } = ctx.vitals.bloodPressure;
            indicators.bp = { systolic: s, diastolic: d };
            if (s >= 180 || d >= 120)      { score += 45; reasons.push(`Hypertensive crisis: ${s}/${d}`); }
            else if (s >= 160 || d >= 100) { score += 25; reasons.push(`Severe uncontrolled hypertension: ${s}/${d}`); }
            else if (s >= 150 && hasHTN)   { score += 15; reasons.push(`Poorly controlled HTN: ${s}/${d}`); }
            else if (s < 90 || d < 60)     { score += 30; reasons.push(`Hypotension: ${s}/${d} — hemodynamic concern`); }
        }

        // ── 4. Medication management complexity ──────────────────────────────

        const onAnticoag  = hasMed(meds, ANTICOAG_KW);
        const onDigoxin   = hasMed(meds, DIGOXIN_KW);
        const onAmiodarone = hasMed(meds, AMIO_KW);
        const onDiuretic  = hasMed(meds, DIURETIC_KW);
        const onACE_ARB   = hasMed(meds, ACE_ARB_KW);
        const onBB        = hasMed(meds, BB_KW);

        if (onDigoxin) {
            score += 20; reasons.push('On digoxin — narrow therapeutic window, needs monitoring');
            indicators.digoxin = true;
        }
        if (onAmiodarone) {
            score += 20; reasons.push('On amiodarone — complex antiarrhythmic, needs thyroid/LFT/pulmonary monitoring');
            indicators.amiodarone = true;
        }
        if (onAnticoag && !onWarfarin) {
            score += 10; reasons.push('On anticoagulation (DOAC)');
            indicators.anticoag = true;
        }

        // Monitoring gap: HF patient without diuretic or ACE/ARB/BB
        if (hasHF) {
            if (!onDiuretic) { score += 10; gaps.push('HF without diuretic on med list'); }
            if (!onACE_ARB && !onBB) { score += 10; gaps.push('HF without ACE/ARB or beta-blocker'); }
        }

        // AFib without anticoagulation (high stroke risk)
        if (hasAfib && !onAnticoag) {
            score += 30; gaps.push('Atrial fibrillation without anticoagulation — stroke risk');
            reasons.push('AFib without anticoagulation');
        }

        // ── 5. Progress note signals ─────────────────────────────────────────

        const cardiacSignal = ctx.noteSignals.find(s =>
            s.category === 'respiratory' ||
            s.snippet.includes('chest pain') || s.snippet.includes('chest discomfort') ||
            s.snippet.includes('edema') || s.snippet.includes('palpitation') ||
            s.snippet.includes('syncope') || s.snippet.includes('shortness of breath')
        );
        if (cardiacSignal) {
            score += 15; reasons.push(`Clinical note: ${cardiacSignal.snippet.slice(0, 80)}`);
        }

        // ── 6. Care plan signals ─────────────────────────────────────────────

        const cardiacCp = ctx.carePlanFocuses.find(f =>
            f.includes('heart failure') || f.includes('congestive heart') ||
            f.includes('anticoagul') || f.includes('cardiac') ||
            f.includes('chest pain') || f.includes('diuretic therapy')
        );
        if (cardiacCp) { score += 5; }

        // Collect indicators
        indicators.gaps = gaps;
        indicators.gapCount = gaps.length;

        const severity: Severity =
            score >= 120 ? 'critical' :
            score >= 70  ? 'high'     :
            score >= 35  ? 'medium'   :
            score > 0    ? 'low'      : 'normal';

        const allReasons = [...reasons, ...gaps.map(g => `⚠ ${g}`)];

        return {
            analysisType: 'cardiology',
            severity,
            score,
            reasoning: allReasons.length > 0
                ? allReasons.join('. ')
                : 'No significant cardiac risk indicators.',
            keyIndicators: indicators,
        };
    },
};
