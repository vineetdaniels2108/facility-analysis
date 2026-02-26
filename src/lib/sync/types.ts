export interface SyncContext {
    simplId: string;
    pccPatientId?: number;
    facId?: number;
    baseUrl: string;
    token: string;
}

export interface SyncResult {
    resource: string;
    synced: number;
    skipped: number;
    errors: number;
    durationMs: number;
}

export interface PccApiResponse<T = Record<string, unknown>> {
    code: number;
    message: string;
    body?: T;
}

// Raw PCC shapes
export interface PccDiagnosticReport {
    reportId: string;
    reportName?: string;
    reportType?: string;
    reportStatus?: string;
    category?: string[];
    reportingLaboratory?: string;
    performingLaboratory?: string;
    orderingPractitioner?: Record<string, unknown>;
    effectiveDateTime?: string;
    issuedDateTime?: string;
    reportFile?: boolean;
    testSet?: PccTestSet[];
}

export interface PccTestSet {
    panelName?: string;
    codings?: { system?: string; code?: string; display?: string }[];
    results?: PccLabResult[];
}

export interface PccLabResult {
    resultStatus?: string;
    code?: string;
    codeSystem?: string;
    codeDescription?: string;
    observationId?: string;
    observationName?: string;
    valueQuantity?: { value?: string | number; unitText?: string; ucumUnitText?: string };
    referenceRange?: string;
    comment?: string;
}

export interface PccCondition {
    conditionId: number;
    conditionCode?: { codings?: { system?: string; code?: string; display?: string }[] };
    icd10?: string;
    icd10Description?: string;
    onsetDate?: string;
    clinicalStatus?: string;
    rankDescription?: string;
    classificationDescription?: string;
    principalDiagnosis?: boolean;
    therapy?: boolean;
    createdBy?: string;
    createdDate?: string;
    revisionBy?: string;
    revisionDate?: string;
}

export interface PccMedication {
    orderId: number;
    facId?: number;
    clientId?: number;
    description?: string;
    generic?: string;
    strength?: string;
    strengthUOM?: string;
    rxNormId?: string;
    directions?: string;
    administration?: { route?: { coding?: { system?: string; code?: string; display?: string }[] } };
    status?: string;
    narcotic?: boolean;
    controlledSubstanceCode?: string;
    startDate?: string;
    endDate?: string;
    orderDate?: string;
    discontinueDate?: string;
    residentName?: string;
    createdBy?: string;
    createdDate?: string;
    revisionBy?: string;
    revDate?: string;
    schedules?: unknown[];
}

export interface PccObservation {
    observationId: number;
    patientId?: number;
    type?: string;
    value?: number;
    unit?: string;
    systolicValue?: number;
    diastolicValue?: number;
    method?: string;
    methodCode?: { codings?: { system?: string; code?: string }[] };
    recordedDate?: string;
    recordedBy?: string;
    strikeOutFlag?: boolean;
    warnings?: { description?: string; cleared?: boolean }[];
}

export interface PccAssessment {
    assessmentId: number;
    assessmentDescription?: string;
    assessmentTypeDescription?: string;
    assessmentStatus?: string;
    assessmentScore?: number;
    templateId?: number;
    templateVersion?: number;
    cmsTemplateId?: string;
    assessmentRefDate?: string;
    createdBy?: string;
    revisionBy?: string;
    revisionDate?: string;
}

export interface PccCarePlan {
    carePlanId: number;
    patientId?: number;
    facId?: number;
    status?: string;
    nextReviewDate?: string;
    createdBy?: string;
    createdDate?: string;
    revisionBy?: string;
    revisionDate?: string;
    focuses?: PccFocus[];
}

export interface PccFocus {
    focusId: number;
    description?: string;
    status?: string;
    createdDate?: string;
    goals?: unknown[];
    interventions?: unknown[];
}

export interface PccProgressNote {
    progressNoteId: number;
    patientId?: number;
    progressNoteType?: string;
    sections?: { name?: string; value?: string }[];
    effectiveDate?: string;
    createdDate?: string;
    createdBy?: string;
    noteCode?: { codings?: { system?: string; code?: string; display?: string }[] };
    followUpTo?: { progressNoteId?: number };
}

export interface PccAdtRecord {
    adtRecordId: number;
    patientId?: number;
    actionType?: string;
    actionCode?: string;
    standardActionType?: string;
    payerName?: string;
    payerType?: string;
    payerCode?: string;
    bedDesc?: string;
    roomDesc?: string;
    unitDesc?: string;
    floorDesc?: string;
    outpatient?: boolean;
    admissionSource?: string;
    admissionType?: string;
    origin?: string;
    originType?: string;
    destination?: string;
    destinationType?: string;
    dischargeStatus?: string;
    transferReason?: string;
    isCancelledRecord?: boolean;
    effectiveDateTime?: string;
    enteredDate?: string;
    enteredBy?: string;
}

export interface PccAllergy {
    allergyIntoleranceId: number;
    patientId?: number;
    allergen?: string;
    allergenCode?: { codings?: { system?: string; code?: string; display?: string }[] };
    category?: string;
    type?: string;
    clinicalStatus?: string;
    severity?: string;
    onsetDate?: string;
    createdBy?: string;
    createdDate?: string;
}

export interface PccImmunization {
    immunizationId: number;
    patientId?: number;
    immunization?: string;
    cvxCode?: string;
    cvxDescription?: string;
    consentStatus?: string;
    given?: boolean;
    administrationDateTime?: string;
    routeOfAdministration?: string;
    locationGiven?: string;
    amountAdministered?: { value?: number; unit?: string };
    manufacturerName?: string;
    lotNumber?: string;
    substanceExpirationDate?: string;
    administeredBy?: string;
    reasonRefused?: string;
    results?: string;
    createdDateTime?: string;
    createdBy?: string;
}

export interface PccCoverage {
    coverageId: number;
    patientId?: number;
    effectiveFromDateTime?: string;
    payers?: {
        payerName?: string;
        payerType?: string;
        payerCode?: string;
        payerRank?: string;
        issuer?: Record<string, unknown>;
        insuredParty?: {
            firstName?: string;
            lastName?: string;
            gender?: string;
            birthDate?: string;
            socialBeneficiaryIdentifier?: string;
            address?: Record<string, unknown>;
        };
    }[];
}
