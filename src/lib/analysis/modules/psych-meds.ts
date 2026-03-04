import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

const DEPRESSION_CODES = ['F32', 'F33'];
const ANXIETY_CODES = ['F40', 'F41'];
const BIPOLAR_CODES = ['F30', 'F31'];
const SCHIZOPHRENIA_CODES = ['F20', 'F21', 'F22', 'F23', 'F24', 'F25'];
const DEMENTIA_BEHAVIORAL_CODES = ['F01', 'F02', 'F03', 'G30', 'G31'];
const PTSD_CODES = ['F43.1'];
const SUBSTANCE_CODES = ['F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19'];
const INSOMNIA_CODES = ['G47.0', 'F51'];

const ANTIPSYCHOTIC_KEYWORDS = [
    'haloperidol', 'haldol', 'risperidone', 'risperdal', 'olanzapine', 'zyprexa',
    'quetiapine', 'seroquel', 'aripiprazole', 'abilify', 'ziprasidone', 'geodon',
    'clozapine', 'clozaril', 'paliperidone', 'invega', 'lurasidone', 'latuda',
    'brexpiprazole', 'rexulti', 'cariprazine', 'vraylar',
];

const ANTIDEPRESSANT_KEYWORDS = [
    'sertraline', 'zoloft', 'fluoxetine', 'prozac', 'paroxetine', 'paxil',
    'escitalopram', 'lexapro', 'citalopram', 'celexa', 'venlafaxine', 'effexor',
    'duloxetine', 'cymbalta', 'bupropion', 'wellbutrin', 'mirtazapine', 'remeron',
    'trazodone', 'amitriptyline', 'nortriptyline',
];

const BENZO_KEYWORDS = [
    'lorazepam', 'ativan', 'diazepam', 'valium', 'alprazolam', 'xanax',
    'clonazepam', 'klonopin', 'temazepam', 'restoril', 'midazolam',
];

const MOOD_STABILIZER_KEYWORDS = [
    'lithium', 'valproic', 'depakote', 'divalproex', 'carbamazepine', 'tegretol',
    'lamotrigine', 'lamictal', 'oxcarbazepine', 'trileptal',
];

export const psychMedsModule: AnalysisModule = {
    type: 'psych_meds',
    name: 'Psychology & Medication Management',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        let score = 0;
        const reasons: string[] = [];
        const icd10s = ctx.activeIcd10Codes;
        const medNames = ctx.activeMedications.map(m => (m.name ?? '').toLowerCase());
        const concerns: { area: string; detail: string; action: string }[] = [];

        // Psychiatric diagnoses
        const hasDepression = icd10s.some(c => DEPRESSION_CODES.some(m => c.startsWith(m)));
        const hasAnxiety = icd10s.some(c => ANXIETY_CODES.some(m => c.startsWith(m)));
        const hasBipolar = icd10s.some(c => BIPOLAR_CODES.some(m => c.startsWith(m)));
        const hasSchiz = icd10s.some(c => SCHIZOPHRENIA_CODES.some(m => c.startsWith(m)));
        const hasDementia = icd10s.some(c => DEMENTIA_BEHAVIORAL_CODES.some(m => c.startsWith(m)));
        const hasSubstance = icd10s.some(c => SUBSTANCE_CODES.some(m => c.startsWith(m)));

        const psychDxCount = [hasDepression, hasAnxiety, hasBipolar, hasSchiz, hasDementia, hasSubstance].filter(Boolean).length;
        if (psychDxCount >= 3) {
            score += 30; reasons.push(`${psychDxCount} psychiatric diagnoses (complex)`);
        } else if (psychDxCount >= 1) {
            score += 10; reasons.push(`${psychDxCount} psychiatric diagnosis(es)`);
        }
        indicators.psychDxCount = psychDxCount;

        // Psychotropic medication inventory
        const antipsychotics = ctx.activeMedications.filter(m =>
            ANTIPSYCHOTIC_KEYWORDS.some(kw => (m.name ?? '').toLowerCase().includes(kw))
        );
        const antidepressants = ctx.activeMedications.filter(m =>
            ANTIDEPRESSANT_KEYWORDS.some(kw => (m.name ?? '').toLowerCase().includes(kw))
        );
        const benzos = ctx.activeMedications.filter(m =>
            BENZO_KEYWORDS.some(kw => (m.name ?? '').toLowerCase().includes(kw))
        );
        const moodStabilizers = ctx.activeMedications.filter(m =>
            MOOD_STABILIZER_KEYWORDS.some(kw => (m.name ?? '').toLowerCase().includes(kw))
        );

        const totalPsychMeds = antipsychotics.length + antidepressants.length + benzos.length + moodStabilizers.length;
        indicators.psychMedCount = totalPsychMeds;
        indicators.antipsychotics = antipsychotics.map(m => m.name);
        indicators.antidepressants = antidepressants.map(m => m.name);
        indicators.benzodiazepines = benzos.map(m => m.name);
        indicators.moodStabilizers = moodStabilizers.map(m => m.name);

        // Antipsychotic in dementia (CMS concern — GDR compliance)
        if (hasDementia && antipsychotics.length > 0) {
            score += 40;
            concerns.push({
                area: 'GDR Compliance',
                detail: `Antipsychotic (${antipsychotics.map(m => m.name).join(', ')}) in dementia patient`,
                action: 'Gradual Dose Reduction (GDR) attempt required per CMS guidelines unless clinically contraindicated',
            });
            reasons.push(`Antipsychotic in dementia: ${antipsychotics.map(m => m.name).join(', ')} — GDR review needed`);
        }

        // Multiple antipsychotics
        if (antipsychotics.length >= 2) {
            score += 30;
            concerns.push({
                area: 'Antipsychotic Polypharmacy',
                detail: `${antipsychotics.length} concurrent antipsychotics`,
                action: 'Evaluate for consolidation to single agent',
            });
            reasons.push(`${antipsychotics.length} concurrent antipsychotics`);
        }

        // Benzodiazepine in elderly (Beers criteria)
        if (benzos.length > 0) {
            score += 25;
            concerns.push({
                area: 'Beers Criteria',
                detail: `Benzodiazepine use: ${benzos.map(m => m.name).join(', ')}`,
                action: 'Evaluate for safer alternatives — fall risk, cognitive impairment risk',
            });
            reasons.push(`Benzodiazepine use: ${benzos.map(m => m.name).join(', ')}`);
        }

        // Antidepressant without depression dx (or vice versa)
        if (hasDepression && antidepressants.length === 0) {
            score += 15;
            concerns.push({
                area: 'Treatment Gap',
                detail: 'Depression diagnosis without antidepressant',
                action: 'Verify treatment plan — non-pharmacological or medication indicated?',
            });
            reasons.push('Depression dx without antidepressant');
        }

        // Psychotropic polypharmacy
        if (totalPsychMeds >= 5) {
            score += 25;
            concerns.push({
                area: 'Psychotropic Polypharmacy',
                detail: `${totalPsychMeds} psychotropic medications`,
                action: 'Psychiatry review recommended for medication optimization',
            });
            reasons.push(`${totalPsychMeds} psychotropic medications (review needed)`);
        } else if (totalPsychMeds >= 3) {
            score += 10;
            reasons.push(`${totalPsychMeds} psychotropic medications`);
        }

        // Lithium monitoring
        if (medNames.some(n => n.includes('lithium'))) {
            const lithiumLab = ctx.labs['LITHIUM'];
            if (!lithiumLab) {
                score += 25;
                concerns.push({
                    area: 'Lithium Monitoring',
                    detail: 'On lithium without recent level',
                    action: 'Order lithium level, BMP, and thyroid panel',
                });
                reasons.push('Lithium without recent level monitoring');
            } else if (lithiumLab.value > 1.5) {
                score += 35;
                concerns.push({
                    area: 'Lithium Toxicity',
                    detail: `Lithium level ${lithiumLab.value} — toxic range`,
                    action: 'Hold lithium, check renal function, monitor closely',
                });
                reasons.push(`Lithium toxic level: ${lithiumLab.value}`);
            }
        }

        // Behavioral note signals
        const behavioralNotes = ctx.noteSignals.filter(s => s.category === 'behavioral');
        if (behavioralNotes.length >= 2) {
            score += 15;
            concerns.push({
                area: 'Behavioral Events',
                detail: `${behavioralNotes.length} behavioral incidents in recent notes`,
                action: 'Review behavioral management plan, consider medication adjustment',
            });
            reasons.push(`${behavioralNotes.length} behavioral incidents noted`);
        }

        // Pain signals
        const painNotes = ctx.noteSignals.filter(s => s.category === 'pain');
        if (ctx.vitals.painLevel && ctx.vitals.painLevel.value >= 7) {
            score += 15;
            concerns.push({
                area: 'Pain Management',
                detail: `Pain level ${ctx.vitals.painLevel.value}/10`,
                action: 'Evaluate pain management plan, consider psychiatric comorbidity impact',
            });
            reasons.push(`Pain level elevated: ${ctx.vitals.painLevel.value}/10`);
        }

        indicators.concerns = concerns;
        indicators.concernCount = concerns.length;

        const severity: Severity = score >= 100 ? 'critical'
            : score >= 60 ? 'high'
            : score >= 30 ? 'medium'
            : score > 0 ? 'low'
            : 'normal';

        return {
            analysisType: 'psych_meds',
            severity,
            score,
            reasoning: reasons.length > 0 ? reasons.join('. ') : 'No significant psychiatric medication concerns.',
            keyIndicators: indicators,
        };
    },
};
