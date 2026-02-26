import { AnalysisModule, AnalysisResult, PatientContext } from '../types';

// ICD-10 codes associated with foley catheter risk
const URINARY_RETENTION_CODES = ['R33', 'R33.0', 'R33.8', 'R33.9'];
const PROSTATE_CODES = ['N40', 'N41', 'N42'];
const NEUROGENIC_BLADDER_CODES = ['N31', 'N31.0', 'N31.1', 'N31.2', 'N31.8', 'N31.9'];
const INCONTINENCE_CODES = ['N39.3', 'N39.4', 'R32'];
const PARKINSON_CODES = ['G20'];
const SPINAL_CODES = ['G83.4', 'G82', 'S14', 'S24', 'S34'];
const UTI_CODES = ['N39.0', 'N30'];
const DIABETES_CODES = ['E10', 'E11', 'E13'];

// RxNorm IDs for anticholinergic medications (foley risk via urinary retention side effect)
const ANTICHOLINERGIC_RXNORM = [
    '41493', // oxybutynin
    '214467', // tolterodine
    '203150', // trospium
    '221130', // darifenacin
    '312831', // solifenacin... approximate
];

export const foleyRiskModule: AnalysisModule = {
    type: 'foley_risk',
    name: 'Foley Catheter Risk',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];

        const icd10s = ctx.activeIcd10Codes;

        // ── Direct urinary retention ─────────────────────────────────────────
        if (icd10s.some(c => URINARY_RETENTION_CODES.some(m => c.startsWith(m)))) {
            score += 80; reasons.push('Active urinary retention diagnosis');
            indicators.urinaryRetention = true;
        }

        // ── Prostate conditions (male patients) ──────────────────────────────
        if (icd10s.some(c => PROSTATE_CODES.some(m => c.startsWith(m)))) {
            score += 50; reasons.push('Active prostate condition');
            indicators.prostateCondition = true;
        }

        // ── Neurogenic bladder ────────────────────────────────────────────────
        if (icd10s.some(c => NEUROGENIC_BLADDER_CODES.some(m => c.startsWith(m)))) {
            score += 60; reasons.push('Neurogenic bladder');
            indicators.neurogenicBladder = true;
        }

        // ── Incontinence ──────────────────────────────────────────────────────
        if (icd10s.some(c => INCONTINENCE_CODES.some(m => c.startsWith(m)))) {
            score += 30; reasons.push('Urinary incontinence');
            indicators.incontinence = true;
        }

        // ── Spinal cord / neurological ────────────────────────────────────────
        if (icd10s.some(c => SPINAL_CODES.some(m => c.startsWith(m)))) {
            score += 50; reasons.push('Spinal cord or cauda equina syndrome');
            indicators.spinalCondition = true;
        }

        // ── Parkinson's (impaired voiding) ────────────────────────────────────
        if (icd10s.some(c => PARKINSON_CODES.some(m => c.startsWith(m)))) {
            score += 25; reasons.push('Parkinson\'s disease (voiding dysfunction risk)');
            indicators.parkinsons = true;
        }

        // ── Repeated UTIs (suggests catheter history) ─────────────────────────
        if (icd10s.some(c => UTI_CODES.some(m => c.startsWith(m)))) {
            score += 20; reasons.push('Active UTI diagnosis');
            indicators.uti = true;
        }

        // ── Diabetic neuropathy risk ──────────────────────────────────────────
        if (icd10s.some(c => DIABETES_CODES.some(m => c.startsWith(m)))) {
            score += 15; reasons.push('Diabetes (autonomic neuropathy risk)');
            indicators.diabetes = true;
        }

        // ── Anticholinergic medications ───────────────────────────────────────
        const antiCholinergicMeds = ctx.activeMedications.filter(m =>
            ANTICHOLINERGIC_RXNORM.includes(m.rxnorm ?? '') ||
            (m.name ?? '').toLowerCase().includes('oxybutynin') ||
            (m.name ?? '').toLowerCase().includes('tolterodine') ||
            (m.name ?? '').toLowerCase().includes('trospium')
        );
        if (antiCholinergicMeds.length > 0) {
            score += 20;
            reasons.push(`Anticholinergic medications active: ${antiCholinergicMeds.map(m => m.name).join(', ')}`);
            indicators.anticholinergics = antiCholinergicMeds.map(m => m.name);
        }

        // ── Care plan signals ─────────────────────────────────────────────────
        const bladderFocus = ctx.carePlanFocuses.find(f =>
            f.includes('bladder') || f.includes('urinary') || f.includes('foley')
            || f.includes('catheter') || f.includes('incontinence') || f.includes('prostate')
        );
        if (bladderFocus) {
            score += 20; reasons.push('Active bladder/urinary care plan focus');
            indicators.carePlanFlag = bladderFocus.slice(0, 80);
        }

        const severity = score >= 100 ? 'critical'
            : score >= 60 ? 'high'
            : score >= 30 ? 'medium'
            : score > 0 ? 'low'
            : 'normal';

        return {
            analysisType: 'foley_risk',
            severity,
            score,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No foley risk indicators detected.',
            keyIndicators: indicators,
        };
    },
};
