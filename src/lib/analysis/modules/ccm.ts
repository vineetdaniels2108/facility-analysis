import { AnalysisModule, AnalysisResult, PatientContext, Severity } from '../types';

// ── Medicare CCM Qualifying Chronic Condition Categories ──────────────────────
// Each category represents a distinct chronic condition group. A patient needs
// 2+ distinct categories to qualify for CCM under Medicare.

interface ConditionCategory {
    category: string;
    label: string;
    icd10Prefixes: string[];
}

const CCM_CONDITION_CATEGORIES: ConditionCategory[] = [
    { category: 'diabetes',        label: 'Diabetes Mellitus',                   icd10Prefixes: ['E10', 'E11', 'E13'] },
    { category: 'ckd',             label: 'Chronic Kidney Disease',              icd10Prefixes: ['N18'] },
    { category: 'heart_failure',   label: 'Heart Failure',                       icd10Prefixes: ['I50'] },
    { category: 'afib',            label: 'Atrial Fibrillation',                 icd10Prefixes: ['I48'] },
    { category: 'hypertension',    label: 'Hypertension',                        icd10Prefixes: ['I10', 'I11', 'I12', 'I13'] },
    { category: 'copd',            label: 'COPD',                                icd10Prefixes: ['J44'] },
    { category: 'asthma',          label: 'Asthma',                              icd10Prefixes: ['J45'] },
    { category: 'depression',      label: 'Depression',                           icd10Prefixes: ['F32', 'F33'] },
    { category: 'dementia',        label: 'Dementia / Alzheimer\'s',             icd10Prefixes: ['F01', 'F02', 'F03', 'G30'] },
    { category: 'osteoporosis',    label: 'Osteoporosis',                         icd10Prefixes: ['M80', 'M81'] },
    { category: 'osteoarthritis',  label: 'Osteoarthritis',                       icd10Prefixes: ['M15', 'M16', 'M17', 'M18', 'M19'] },
    { category: 'rheumatoid',      label: 'Rheumatoid Arthritis',                icd10Prefixes: ['M05', 'M06'] },
    { category: 'obesity',         label: 'Obesity',                              icd10Prefixes: ['E66'] },
    { category: 'hyperlipidemia',  label: 'Hyperlipidemia',                       icd10Prefixes: ['E78'] },
    { category: 'parkinsons',      label: 'Parkinson\'s Disease',                icd10Prefixes: ['G20'] },
    { category: 'cancer',          label: 'Cancer / Malignant Neoplasm',         icd10Prefixes: ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'] },
    { category: 'pvd',             label: 'Peripheral Vascular Disease',         icd10Prefixes: ['I73'] },
    { category: 'cerebrovascular', label: 'Cerebrovascular Disease / Stroke',    icd10Prefixes: ['I60', 'I61', 'I62', 'I63', 'I64', 'I65', 'I66', 'I67', 'I68', 'I69'] },
    { category: 'liver_disease',   label: 'Chronic Liver Disease',               icd10Prefixes: ['K70', 'K71', 'K72', 'K73', 'K74'] },
    { category: 'thyroid',         label: 'Thyroid Disorder',                     icd10Prefixes: ['E01', 'E02', 'E03', 'E04', 'E05', 'E06'] },
    { category: 'anemia',          label: 'Chronic Anemia',                       icd10Prefixes: ['D50', 'D51', 'D52', 'D53', 'D55', 'D56', 'D57', 'D58', 'D59', 'D60', 'D61', 'D62', 'D63', 'D64'] },
    { category: 'epilepsy',        label: 'Epilepsy',                             icd10Prefixes: ['G40'] },
    { category: 'anxiety',         label: 'Anxiety Disorders',                    icd10Prefixes: ['F40', 'F41'] },
    { category: 'bipolar',         label: 'Bipolar Disorder',                     icd10Prefixes: ['F31'] },
    { category: 'schizophrenia',   label: 'Schizophrenia / Psychotic Disorders', icd10Prefixes: ['F20', 'F25'] },
    { category: 'dvt_pe',          label: 'DVT / Pulmonary Embolism',            icd10Prefixes: ['I26', 'I82'] },
    { category: 'gerd',            label: 'GERD / Chronic GI Disease',           icd10Prefixes: ['K21', 'K50', 'K51', 'K58'] },
];

interface QualifyingCondition {
    icd10: string;
    description: string;
    category: string;
    categoryLabel: string;
}

interface MissingMonitoring {
    condition: string;
    gap: string;
    recommendation: string;
}

function matchCategory(icd10: string): ConditionCategory | null {
    for (const cat of CCM_CONDITION_CATEGORIES) {
        if (cat.icd10Prefixes.some(prefix => icd10.startsWith(prefix))) {
            return cat;
        }
    }
    return null;
}

// Medication keywords mapped to condition categories for complexity scoring
const CHRONIC_MED_KEYWORDS: Record<string, string[]> = {
    diabetes:      ['metformin', 'insulin', 'glipizide', 'glimepiride', 'jardiance', 'ozempic', 'trulicity', 'lantus', 'novolog', 'humalog', 'basaglar', 'tradjenta', 'victoza'],
    hypertension:  ['lisinopril', 'amlodipine', 'losartan', 'metoprolol', 'hydrochlorothiazide', 'valsartan', 'enalapril', 'olmesartan', 'irbesartan', 'carvedilol'],
    heart_failure: ['furosemide', 'lasix', 'spironolactone', 'entresto', 'sacubitril', 'carvedilol', 'digoxin', 'bumetanide', 'torsemide'],
    afib:          ['warfarin', 'coumadin', 'eliquis', 'apixaban', 'xarelto', 'rivaroxaban', 'pradaxa', 'dabigatran', 'amiodarone', 'diltiazem', 'digoxin'],
    copd:          ['albuterol', 'ipratropium', 'tiotropium', 'spiriva', 'advair', 'symbicort', 'breo', 'budesonide'],
    depression:    ['sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'paroxetine', 'venlafaxine', 'duloxetine', 'bupropion', 'mirtazapine', 'trazodone'],
    thyroid:       ['levothyroxine', 'synthroid', 'armour thyroid', 'liothyronine', 'methimazole'],
    hyperlipidemia:['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin', 'lovastatin', 'ezetimibe'],
    osteoporosis:  ['alendronate', 'risedronate', 'zoledronic', 'denosumab', 'prolia', 'raloxifene'],
    epilepsy:      ['levetiracetam', 'keppra', 'lamotrigine', 'phenytoin', 'valproic', 'carbamazepine', 'gabapentin', 'topiramate'],
    anxiety:       ['buspirone', 'lorazepam', 'alprazolam', 'clonazepam', 'hydroxyzine'],
    parkinsons:    ['carbidopa', 'levodopa', 'sinemet', 'pramipexole', 'ropinirole', 'entacapone'],
};

function countChronicMeds(meds: PatientContext['activeMedications'], matchedCategories: Set<string>): number {
    let count = 0;
    for (const med of meds) {
        const name = (med.name ?? '').toLowerCase();
        for (const [cat, keywords] of Object.entries(CHRONIC_MED_KEYWORDS)) {
            if (matchedCategories.has(cat) && keywords.some(kw => name.includes(kw))) {
                count++;
                break;
            }
        }
    }
    return count;
}

function findMissingMonitoring(ctx: PatientContext, matchedCategories: Set<string>): MissingMonitoring[] {
    const missing: MissingMonitoring[] = [];

    if (matchedCategories.has('diabetes')) {
        const hasA1c = !!(ctx.labs['HBA1C'] ?? ctx.labs['A1C'] ?? ctx.labs['HA1C'] ?? ctx.labs['HEMOGLOBIN A1C']);
        if (!hasA1c) missing.push({ condition: 'Diabetes', gap: 'No HbA1c on file', recommendation: 'Order HbA1c for diabetes monitoring' });
    }
    if (matchedCategories.has('ckd')) {
        if (!ctx.labs['BUN'] || !(ctx.labs['CREAT'] ?? ctx.labs['CREATININE'])) {
            missing.push({ condition: 'CKD', gap: 'Missing BUN/Creatinine', recommendation: 'Order renal panel' });
        }
    }
    if (matchedCategories.has('thyroid')) {
        if (!ctx.labs['TSH']) missing.push({ condition: 'Thyroid', gap: 'No TSH on file', recommendation: 'Order TSH for thyroid monitoring' });
    }
    if (matchedCategories.has('anemia')) {
        if (!ctx.labs['HGB']) missing.push({ condition: 'Anemia', gap: 'No CBC/HGB on file', recommendation: 'Order CBC to monitor anemia' });
    }
    if (matchedCategories.has('heart_failure')) {
        if (!(ctx.labs['BNP'] ?? ctx.labs['NT-PROBNP'])) {
            missing.push({ condition: 'Heart Failure', gap: 'No BNP/NT-proBNP', recommendation: 'Order BNP for heart failure monitoring' });
        }
    }
    if (matchedCategories.has('liver_disease')) {
        if (!(ctx.labs['ALT'] ?? ctx.labs['ALT_(SGPT)']) || !(ctx.labs['AST'] ?? ctx.labs['AST_(SGOT)'])) {
            missing.push({ condition: 'Liver Disease', gap: 'Missing LFTs', recommendation: 'Order hepatic panel' });
        }
    }
    if (matchedCategories.has('hyperlipidemia')) {
        if (!(ctx.labs['CHOLESTEROL'] ?? ctx.labs['LDL'] ?? ctx.labs['CALCULATED_LDL'])) {
            missing.push({ condition: 'Hyperlipidemia', gap: 'No lipid panel on file', recommendation: 'Order lipid panel' });
        }
    }

    return missing;
}

export const ccmModule: AnalysisModule = {
    type: 'ccm',
    name: 'Chronic Care Management',

    analyze(ctx: PatientContext): AnalysisResult {
        const indicators: Record<string, unknown> = {};
        const reasons: string[] = [];

        // Identify qualifying chronic conditions by category
        const matchedCategories = new Set<string>();
        const qualifyingConditions: QualifyingCondition[] = [];

        for (const cond of ctx.activeConditions) {
            const cat = matchCategory(cond.icd10);
            if (cat) {
                matchedCategories.add(cat.category);
                qualifyingConditions.push({
                    icd10: cond.icd10,
                    description: cond.description,
                    category: cat.category,
                    categoryLabel: cat.label,
                });
            }
        }

        const conditionCount = matchedCategories.size;
        const isEligible = conditionCount >= 2;

        // Score based on number of distinct chronic condition categories
        let score = 0;
        if (conditionCount >= 7) score = 100;
        else if (conditionCount >= 5) score = 75;
        else if (conditionCount >= 3) score = 50;
        else if (conditionCount >= 2) score = 25;

        // Bonus for active medication management complexity
        const chronicMedCount = countChronicMeds(ctx.activeMedications, matchedCategories);
        if (chronicMedCount >= 8) score += 15;
        else if (chronicMedCount >= 5) score += 10;
        else if (chronicMedCount >= 3) score += 5;

        // Missing monitoring gaps increase urgency
        const missingMonitoring = findMissingMonitoring(ctx, matchedCategories);
        score += missingMonitoring.length * 5;

        // Build reasoning
        if (isEligible) {
            const categoryLabels = [...matchedCategories].map(cat =>
                CCM_CONDITION_CATEGORIES.find(c => c.category === cat)?.label ?? cat
            );
            reasons.push(`CCM eligible: ${conditionCount} qualifying chronic conditions (${categoryLabels.join(', ')})`);
            if (chronicMedCount > 0) reasons.push(`${chronicMedCount} chronic disease medications actively managed`);
            if (missingMonitoring.length > 0) {
                reasons.push(`${missingMonitoring.length} monitoring gap(s): ${missingMonitoring.map(m => m.gap).join('; ')}`);
            }
        } else if (conditionCount === 1) {
            reasons.push(`1 qualifying chronic condition — does not meet CCM threshold of 2+`);
        } else {
            reasons.push('No qualifying chronic conditions identified for CCM');
        }

        // Determine complexity tier and severity
        let complexityTier: string;
        let severity: Severity;
        let priority: string;

        if (conditionCount >= 7) {
            complexityTier = 'complex'; severity = 'critical'; priority = 'high_complexity_ccm';
        } else if (conditionCount >= 5) {
            complexityTier = 'complex'; severity = 'high'; priority = 'complex_ccm';
        } else if (conditionCount >= 3) {
            complexityTier = 'moderate'; severity = 'medium'; priority = 'moderate_ccm';
        } else if (conditionCount >= 2) {
            complexityTier = 'standard'; severity = 'low'; priority = 'standard_ccm';
        } else {
            complexityTier = 'not_eligible'; severity = 'normal'; priority = 'none';
        }

        // Deduplicate qualifying conditions (keep one per category)
        const seenCategories = new Set<string>();
        const uniqueConditions = qualifyingConditions.filter(qc => {
            if (seenCategories.has(qc.category)) return false;
            seenCategories.add(qc.category);
            return true;
        });

        indicators.qualifyingConditions = uniqueConditions;
        indicators.conditionCount = conditionCount;
        indicators.isEligible = isEligible;
        indicators.complexityTier = complexityTier;
        indicators.activeMedicationCount = chronicMedCount;
        indicators.missingMonitoring = missingMonitoring;
        indicators.allMatchedCategories = [...matchedCategories];

        return {
            analysisType: 'ccm',
            severity,
            score,
            priority,
            reasoning: reasons.join('. '),
            keyIndicators: indicators,
        };
    },
};

export { CCM_CONDITION_CATEGORIES };
export type { QualifyingCondition, MissingMonitoring };
