import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

const HF_CODES = ['I50', 'I50.1', 'I50.2', 'I50.3', 'I50.4', 'I50.8', 'I50.9'];
const CAD_CODES = ['I25', 'I25.1', 'I25.10', 'I25.11'];
const AFIB_CODES = ['I48', 'I48.0', 'I48.1', 'I48.2', 'I48.9'];
const MI_CODES = ['I21', 'I22', 'I23', 'I24', 'I25.2'];
const HYPERTENSION_CODES = ['I10', 'I11', 'I12', 'I13', 'I15'];
const VALVE_CODES = ['I34', 'I35', 'I36', 'I37', 'I38'];
const CARDIOMYOPATHY_CODES = ['I42', 'I43'];
const DVT_PE_CODES = ['I26', 'I80', 'I82'];

const CARDIAC_MEDS_KEYWORDS = [
    'metoprolol', 'carvedilol', 'lisinopril', 'enalapril', 'losartan', 'valsartan',
    'amlodipine', 'diltiazem', 'digoxin', 'furosemide', 'spironolactone',
    'warfarin', 'eliquis', 'apixaban', 'rivaroxaban', 'xarelto',
    'entresto', 'sacubitril', 'hydralazine', 'isosorbide',
    'amiodarone', 'sotalol', 'dofetilide',
    'nitroglycerin', 'clopidogrel', 'plavix', 'aspirin',
    'atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin',
];

export const cardiologyModule: AnalysisModule = {
    type: 'cardiology',
    name: 'Heart Disease & Cardiology',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];
        const icd10s = ctx.activeIcd10Codes;

        const hfDx = icd10s.filter(c => HF_CODES.some(m => c.startsWith(m)));
        if (hfDx.length > 0) {
            score += 60; reasons.push('Heart failure diagnosis: ' + hfDx.join(', '));
            indicators.heartFailure = hfDx;
        }

        if (icd10s.some(c => CAD_CODES.some(m => c.startsWith(m)))) {
            score += 40; reasons.push('Coronary artery disease');
            indicators.cad = true;
        }

        if (icd10s.some(c => AFIB_CODES.some(m => c.startsWith(m)))) {
            score += 35; reasons.push('Atrial fibrillation');
            indicators.afib = true;
        }

        if (icd10s.some(c => MI_CODES.some(m => c.startsWith(m)))) {
            score += 45; reasons.push('Myocardial infarction history');
            indicators.mi = true;
        }

        if (icd10s.some(c => HYPERTENSION_CODES.some(m => c.startsWith(m)))) {
            score += 10; reasons.push('Hypertension');
            indicators.hypertension = true;
        }

        if (icd10s.some(c => VALVE_CODES.some(m => c.startsWith(m)))) {
            score += 30; reasons.push('Valvular heart disease');
            indicators.valveDisease = true;
        }

        if (icd10s.some(c => CARDIOMYOPATHY_CODES.some(m => c.startsWith(m)))) {
            score += 35; reasons.push('Cardiomyopathy');
            indicators.cardiomyopathy = true;
        }

        if (icd10s.some(c => DVT_PE_CODES.some(m => c.startsWith(m)))) {
            score += 30; reasons.push('DVT/PE history');
            indicators.dvtPe = true;
        }

        const bnp = ctx.labs['BNP'] ?? ctx.labs['NT-PROBNP'] ?? ctx.labs['NTPROBNP'];
        if (bnp) {
            indicators.bnp = { value: bnp.value, unit: bnp.unit };
            if (bnp.value > 900) {
                score += 50; reasons.push('BNP critically elevated: ' + bnp.value + ' ' + bnp.unit);
            } else if (bnp.value > 400) {
                score += 30; reasons.push('BNP elevated: ' + bnp.value + ' ' + bnp.unit);
            } else if (bnp.value > 100) {
                score += 10; reasons.push('BNP mildly elevated: ' + bnp.value + ' ' + bnp.unit);
            }
        }

        const trop = ctx.labs['TROPONIN'] ?? ctx.labs['TROPONIN I'] ?? ctx.labs['TROP'];
        if (trop && trop.isAbnormal) {
            score += 40;
            reasons.push('Troponin elevated: ' + trop.value + ' ' + trop.unit);
            indicators.troponin = trop.value;
        }

        if (ctx.vitals.bloodPressure) {
            const { systolic, diastolic } = ctx.vitals.bloodPressure;
            indicators.bp = { systolic, diastolic };
            if (systolic >= 180 || diastolic >= 120) {
                score += 40; reasons.push('Hypertensive crisis: ' + systolic + '/' + diastolic);
            } else if (systolic >= 160 || diastolic >= 100) {
                score += 20; reasons.push('Severe hypertension: ' + systolic + '/' + diastolic);
            } else if (systolic < 90 || diastolic < 60) {
                score += 30; reasons.push('Hypotension: ' + systolic + '/' + diastolic);
            }
        }

        const cardiacMeds = ctx.activeMedications.filter(m =>
            CARDIAC_MEDS_KEYWORDS.some(kw => (m.name ?? '').toLowerCase().includes(kw))
        );
        if (cardiacMeds.length >= 5) {
            score += 20; reasons.push(cardiacMeds.length + ' cardiac medications (complex regimen)');
            indicators.cardiacMedCount = cardiacMeds.length;
        } else if (cardiacMeds.length >= 3) {
            score += 10; reasons.push(cardiacMeds.length + ' cardiac medications');
            indicators.cardiacMedCount = cardiacMeds.length;
        }

        const inr = ctx.labs['INR'];
        if (inr) {
            indicators.inr = { value: inr.value };
            if (inr.value > 4.0) {
                score += 35; reasons.push('INR dangerously elevated: ' + inr.value + ' - bleeding risk');
            } else if (inr.value > 3.5) {
                score += 20; reasons.push('INR elevated: ' + inr.value);
            } else if (inr.value < 1.5 && cardiacMeds.some(m => (m.name ?? '').toLowerCase().includes('warfarin'))) {
                score += 15; reasons.push('INR sub-therapeutic: ' + inr.value + ' on warfarin');
            }
        }

        const cardiacCp = ctx.carePlanFocuses.find(f =>
            f.includes('cardiac') || f.includes('heart') || f.includes('anticoagul')
            || f.includes('blood pressure') || f.includes('chest pain')
        );
        if (cardiacCp) {
            score += 10; reasons.push('Active cardiac care plan focus');
        }

        const noteSignal = ctx.noteSignals.find(s =>
            s.category === 'respiratory' || s.snippet.includes('chest pain') || s.snippet.includes('edema')
        );
        if (noteSignal) {
            score += 10; reasons.push('Progress note: ' + noteSignal.snippet);
        }

        const severity: Severity = score >= 120 ? 'critical'
            : score >= 70 ? 'high'
            : score >= 35 ? 'medium'
            : score > 0 ? 'low'
            : 'normal';

        return {
            analysisType: 'cardiology',
            severity,
            score,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No significant cardiac risk indicators.',
            keyIndicators: indicators,
        };
    },
};
