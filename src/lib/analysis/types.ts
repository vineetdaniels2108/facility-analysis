export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'normal';

export interface LabSnapshot {
    name: string;
    value: number;
    unit: string;
    refLow: number | null;
    refHigh: number | null;
    isAbnormal: boolean;
    isCritical: boolean;
    effectiveAt: Date;
    trend?: 'rising' | 'falling' | 'stable';
    previousValue?: number;
    previousDate?: Date;
}

export interface PatientContext {
    simplId: string;
    // Latest labs keyed by observation_name (e.g. "HGB", "ALB")
    labs: Record<string, LabSnapshot>;
    // Lab history for trend analysis: name -> sorted array (newest first)
    labHistory: Record<string, LabSnapshot[]>;
    // Active ICD-10 codes
    activeIcd10Codes: string[];
    // Active condition descriptions
    activeConditions: { icd10: string; description: string }[];
    // Active care plan focus descriptions (lowercased for matching)
    carePlanFocuses: string[];
    // Active medication names + rxnorm IDs
    activeMedications: { name: string; rxnorm?: string; directions?: string }[];
    // Assessment scores by template description
    assessmentScores: Record<string, number>;
    // Latest vitals
    vitals: {
        bloodPressure?: { systolic: number; diastolic: number; recordedAt: Date };
        bloodSugar?: { value: number; recordedAt: Date };
        painLevel?: { value: number; recordedAt: Date };
        weight?: { value: number; recordedAt: Date };
    };
    // Structured clinical signals extracted from recent progress notes
    noteSignals: NoteSignal[];
}

export interface NoteSignal {
    category: 'fall' | 'swallowing' | 'nutrition' | 'bleeding' | 'catheter' | 'wound' | 'respiratory' | 'behavioral' | 'pain';
    keyword: string;
    snippet: string;       // short excerpt around the matched keyword
    date: Date;
}

export interface AnalysisResult {
    analysisType: string;
    severity: Severity;
    score: number;
    priority?: string;
    reasoning: string;
    keyIndicators: Record<string, unknown>;
}

export interface AnalysisModule {
    type: string;
    name: string;
    analyze(ctx: PatientContext): AnalysisResult;
}
