-- ============================================================================
-- Simpl AI – PostgreSQL Schema
-- Designed from real PCC API data (3 patients, 11 resource types)
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

CREATE TABLE organizations (
    id              SERIAL PRIMARY KEY,
    org_id          BIGINT UNIQUE NOT NULL,          -- PCC orgId (e.g. 5000266)
    org_uuid        TEXT UNIQUE,                      -- PCC orgUuid
    name            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE facilities (
    id              SERIAL PRIMARY KEY,
    org_id          BIGINT REFERENCES organizations(org_id),
    fac_id          INT NOT NULL,                     -- PCC facId (e.g. 121)
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, fac_id)
);

CREATE TABLE patients (
    id              SERIAL PRIMARY KEY,
    simpl_id        UUID UNIQUE NOT NULL,             -- our universal key
    pcc_patient_id  BIGINT,                           -- PCC patientId
    first_name      TEXT,
    last_name       TEXT,
    date_of_birth   DATE,
    gender          TEXT,
    fac_id          INT,
    room            TEXT,                              -- from ADT records
    bed             TEXT,
    unit            TEXT,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_simpl ON patients(simpl_id);
CREATE INDEX idx_patients_fac ON patients(fac_id);

-- ============================================================================
-- SYNC TRACKING
-- ============================================================================

CREATE TABLE sync_log (
    id              SERIAL PRIMARY KEY,
    simpl_id        UUID REFERENCES patients(simpl_id),
    resource_type   TEXT NOT NULL,                    -- OBSERVATIONS, CONDITIONS, etc.
    records_synced  INT DEFAULT 0,
    status          TEXT DEFAULT 'success',           -- success, error, partial
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_sync_patient ON sync_log(simpl_id, resource_type);

-- ============================================================================
-- CLINICAL DATA TABLES
-- ============================================================================

-- DIAGNOSTIC REPORTS (lab orders + results)
CREATE TABLE diagnostic_reports (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    report_id           TEXT NOT NULL,                -- PCC reportId (e.g. "lab-470332")
    report_name         TEXT,
    report_type         TEXT,                         -- "Laboratory"
    report_status       TEXT,                         -- "Completed"
    categories          TEXT[],                       -- ["Chemistry", "Hematology"]
    reporting_lab       TEXT,
    performing_lab      TEXT,
    ordering_provider   JSONB,                        -- {practitionerId, firstName, lastName, npi}
    effective_at        TIMESTAMPTZ,
    issued_at           TIMESTAMPTZ,
    has_report_file     BOOLEAN DEFAULT FALSE,
    raw_data            JSONB,                        -- full PCC record for reference
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, report_id)
);

CREATE INDEX idx_diag_patient ON diagnostic_reports(simpl_id);
CREATE INDEX idx_diag_effective ON diagnostic_reports(simpl_id, effective_at DESC);

-- LAB RESULTS (flattened from diagnostic_reports.testSet.results)
CREATE TABLE lab_results (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    report_id           TEXT NOT NULL,                -- FK to diagnostic_reports
    panel_name          TEXT,                         -- "CBC w/ Auto Diff", "Comprehensive Metabolic Panel"
    observation_id      TEXT,                         -- PCC observationId within testSet
    observation_name    TEXT,                         -- "HGB", "ALB", "WBC", "BUN", "Creatinine"
    loinc_code          TEXT,                         -- LOINC code (e.g. "718-7" for Hemoglobin)
    loinc_description   TEXT,
    result_status       TEXT,                         -- "Final", "Preliminary"
    value_numeric       NUMERIC,                      -- parsed numeric value
    value_text          TEXT,                          -- original text value
    unit                TEXT,                          -- "g/dL", "g/L", "K/uL"
    reference_range     TEXT,                          -- "13.7-17.5"
    ref_low             NUMERIC,                      -- parsed from reference_range
    ref_high            NUMERIC,
    is_abnormal         BOOLEAN,
    is_critical         BOOLEAN,
    comment             TEXT,
    effective_at        TIMESTAMPTZ,                  -- from parent report
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, report_id, observation_id)
);

CREATE INDEX idx_labs_patient ON lab_results(simpl_id);
CREATE INDEX idx_labs_name ON lab_results(simpl_id, observation_name);
CREATE INDEX idx_labs_date ON lab_results(simpl_id, effective_at DESC);
CREATE INDEX idx_labs_loinc ON lab_results(loinc_code);
CREATE INDEX idx_labs_abnormal ON lab_results(simpl_id, is_abnormal) WHERE is_abnormal = TRUE;

-- CONDITIONS (diagnoses with ICD-10 and SNOMED codes)
CREATE TABLE conditions (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    condition_id        BIGINT NOT NULL,              -- PCC conditionId
    snomed_code         TEXT,
    snomed_display      TEXT,
    icd10_code          TEXT,                         -- "G30.8", "E46"
    icd10_description   TEXT,
    onset_date          DATE,
    clinical_status     TEXT,                         -- "ACTIVE", "RESOLVED"
    rank_description    TEXT,                         -- "Primary", "Secondary"
    classification      TEXT,                         -- "Admitting Dx", "Admission"
    is_principal        BOOLEAN DEFAULT FALSE,
    is_therapy          BOOLEAN DEFAULT FALSE,
    created_by          TEXT,
    created_at          TIMESTAMPTZ,
    revised_by          TEXT,
    revised_at          TIMESTAMPTZ,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, condition_id)
);

CREATE INDEX idx_conditions_patient ON conditions(simpl_id);
CREATE INDEX idx_conditions_icd10 ON conditions(icd10_code);
CREATE INDEX idx_conditions_active ON conditions(simpl_id, clinical_status) WHERE clinical_status = 'ACTIVE';

-- MEDICATIONS
CREATE TABLE medications (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    order_id            BIGINT NOT NULL,              -- PCC orderId
    description         TEXT,                         -- "risperiDONE Tablet 2 MG"
    generic_name        TEXT,
    strength            TEXT,
    strength_uom        TEXT,
    rxnorm_id           TEXT,
    directions          TEXT,
    route_code          TEXT,                         -- "by_mouth", "subcutaneous"
    route_display       TEXT,
    status              TEXT,                         -- "ACTIVE", "DISCONTINUED"
    is_narcotic         BOOLEAN DEFAULT FALSE,
    controlled_sub_code TEXT,
    start_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,
    order_date          TIMESTAMPTZ,
    discontinue_date    TIMESTAMPTZ,
    resident_name       TEXT,
    created_by          TEXT,
    created_at          TIMESTAMPTZ,
    revised_by          TEXT,
    revised_at          TIMESTAMPTZ,
    schedules           JSONB,                        -- full schedules array (dose, frequency, last admin)
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, order_id)
);

CREATE INDEX idx_meds_patient ON medications(simpl_id);
CREATE INDEX idx_meds_active ON medications(simpl_id, status) WHERE status = 'ACTIVE';
CREATE INDEX idx_meds_rxnorm ON medications(rxnorm_id);

-- OBSERVATIONS (vitals: BP, blood sugar, pain level, temperature, etc.)
CREATE TABLE observations (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    observation_id      BIGINT NOT NULL,              -- PCC observationId
    type                TEXT NOT NULL,                 -- "bloodPressure", "bloodSugar", "painLevel", etc.
    value               NUMERIC,
    unit                TEXT,
    systolic_value      INT,                          -- BP only
    diastolic_value     INT,                          -- BP only
    method              TEXT,                         -- "Lying r/arm", "Numerical"
    loinc_code          TEXT,
    recorded_at         TIMESTAMPTZ,
    recorded_by         TEXT,
    is_struck_out       BOOLEAN DEFAULT FALSE,
    warnings            JSONB,                        -- [{description, cleared}]
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, observation_id)
);

CREATE INDEX idx_obs_patient ON observations(simpl_id);
CREATE INDEX idx_obs_type ON observations(simpl_id, type, recorded_at DESC);

-- ASSESSMENTS
CREATE TABLE assessments (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    assessment_id       BIGINT NOT NULL,
    description         TEXT,                         -- "Weekly Skin Assessment - V 6"
    assessment_type     TEXT,                         -- "Weekly", "Admission", "Annual", "Other"
    status              TEXT,                         -- "Complete"
    score               NUMERIC,
    template_id         BIGINT,
    template_version    NUMERIC,
    cms_template_id     TEXT,
    ref_date            TIMESTAMPTZ,
    created_by          TEXT,
    revised_by          TEXT,
    revised_at          TIMESTAMPTZ,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, assessment_id)
);

CREATE INDEX idx_assess_patient ON assessments(simpl_id);
CREATE INDEX idx_assess_type ON assessments(simpl_id, description);
CREATE INDEX idx_assess_date ON assessments(simpl_id, ref_date DESC);

-- CARE PLANS
CREATE TABLE care_plans (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    care_plan_id        BIGINT NOT NULL,
    status              TEXT,
    next_review_date    TIMESTAMPTZ,
    created_by          TEXT,
    created_at          TIMESTAMPTZ,
    revised_by          TEXT,
    revised_at          TIMESTAMPTZ,
    raw_data            JSONB,                        -- full record including focuses
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, care_plan_id)
);

-- CARE PLAN FOCUSES (flattened for querying)
CREATE TABLE care_plan_focuses (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    care_plan_id        BIGINT NOT NULL,
    focus_id            BIGINT NOT NULL,
    description         TEXT,                         -- "Gary has Dysphagia"
    status              TEXT,                         -- "Active", "Resolved", "Cancelled"
    created_at          TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, care_plan_id, focus_id)
);

CREATE INDEX idx_cpf_patient ON care_plan_focuses(simpl_id);
CREATE INDEX idx_cpf_active ON care_plan_focuses(simpl_id, status) WHERE status = 'Active';

-- PROGRESS NOTES
CREATE TABLE progress_notes (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    note_id             BIGINT NOT NULL,              -- PCC progressNoteId
    note_type           TEXT,                         -- "Order Change Note", "Weekly Summary", etc.
    effective_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ,
    created_by          TEXT,
    loinc_code          TEXT,                         -- from noteCode.codings
    follow_up_to_id     BIGINT,                       -- linked parent note
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, note_id)
);

-- PROGRESS NOTE SECTIONS (flattened for text search / NLP)
CREATE TABLE progress_note_sections (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    note_id             BIGINT NOT NULL,
    section_name        TEXT,                         -- "Note Text", "Order Details", "Skin"
    section_value       TEXT,                         -- free-text clinical content
    synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pns_patient ON progress_note_sections(simpl_id);
CREATE INDEX idx_pns_note ON progress_note_sections(note_id);
CREATE INDEX idx_pns_search ON progress_note_sections USING GIN (to_tsvector('english', section_value));

-- ADT RECORDS (admissions, discharges, transfers)
CREATE TABLE adt_records (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    adt_record_id       BIGINT NOT NULL,
    action_type         TEXT,                         -- "Payer Change", "Room Change", "ReAdmission"
    action_code         TEXT,                         -- "PC", "RC", "RA"
    standard_action     TEXT,                         -- "Internal Transfer", "Admission", "Discharge"
    payer_name          TEXT,
    payer_type          TEXT,                         -- "medicaid", "medicare", "private"
    payer_code          TEXT,
    room                TEXT,
    bed                 TEXT,
    unit                TEXT,
    floor               TEXT,
    is_outpatient       BOOLEAN DEFAULT FALSE,
    admission_source    TEXT,                         -- "Transfer from a Hospital"
    admission_type      TEXT,                         -- "Elective"
    origin              TEXT,                         -- origin facility name
    origin_type         TEXT,                         -- "Acute care hospital"
    destination         TEXT,
    destination_type    TEXT,
    discharge_status    TEXT,
    transfer_reason     TEXT,                         -- "Fall", "Chest Pain"
    effective_at        TIMESTAMPTZ,
    entered_at          TIMESTAMPTZ,
    entered_by          TEXT,
    is_cancelled        BOOLEAN DEFAULT FALSE,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, adt_record_id)
);

CREATE INDEX idx_adt_patient ON adt_records(simpl_id);
CREATE INDEX idx_adt_date ON adt_records(simpl_id, effective_at DESC);
CREATE INDEX idx_adt_action ON adt_records(action_type);

-- ALLERGIES
CREATE TABLE allergies (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    allergy_id          BIGINT NOT NULL,              -- PCC allergyIntoleranceId
    allergen            TEXT,                         -- "Seroquel", "Sulfa Antibiotics"
    allergen_snomed     TEXT,                         -- SNOMED code if available
    allergen_rxnorm     TEXT,                         -- RxNorm code if available
    category            TEXT,                         -- "Drug", "Food", "Environment"
    allergy_type        TEXT,                         -- "Allergy", "Intolerance"
    clinical_status     TEXT,                         -- "active"
    severity            TEXT,                         -- "Unknown", "Mild", "Moderate", "Severe"
    onset_date          DATE,
    created_by          TEXT,
    created_at          TIMESTAMPTZ,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, allergy_id)
);

CREATE INDEX idx_allergy_patient ON allergies(simpl_id);

-- IMMUNIZATIONS
CREATE TABLE immunizations (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    immunization_id     BIGINT NOT NULL,
    name                TEXT,                         -- "Influenza", "COVID-19"
    cvx_code            TEXT,                         -- CVX vaccine code
    cvx_description     TEXT,
    consent_status      TEXT,                         -- "Consented", "Refused"
    was_given           BOOLEAN DEFAULT FALSE,
    administered_at     TIMESTAMPTZ,
    route               TEXT,                         -- "intramuscularly"
    location_given      TEXT,                         -- "Left Deltoid"
    dose_value          NUMERIC,
    dose_unit           TEXT,                         -- "ml"
    manufacturer        TEXT,
    lot_number          TEXT,
    expiration_date     DATE,
    administered_by     TEXT,
    reason_refused      TEXT,
    results             TEXT,                         -- "Negative", "Positive"
    created_at          TIMESTAMPTZ,
    created_by          TEXT,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, immunization_id)
);

CREATE INDEX idx_immun_patient ON immunizations(simpl_id);

-- COVERAGES (insurance/payer info)
CREATE TABLE coverages (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    coverage_id         BIGINT NOT NULL,
    effective_from      TIMESTAMPTZ,
    payers              JSONB,                        -- full payers array (contains PII: SSN, address)
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, coverage_id)
);

CREATE INDEX idx_coverage_patient ON coverages(simpl_id);

-- ============================================================================
-- ANALYSIS TABLES
-- ============================================================================

-- Pre-computed analysis results per patient
CREATE TABLE analysis_results (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    analysis_type       TEXT NOT NULL,                -- 'infusion', 'transfusion', 'foley_risk', 'gtube_risk', 'mtn_risk'
    severity            TEXT,                         -- 'critical', 'high', 'medium', 'low', 'normal'
    score               NUMERIC,                     -- numeric risk score
    priority            TEXT,                         -- 'infuse', 'transfuse', 'monitor', etc.
    reasoning           TEXT,                         -- human-readable explanation
    key_indicators      JSONB,                        -- {hgb: 6.2, albumin: 2.1, ...}
    triggering_lab_id   INT REFERENCES lab_results(id),
    computed_at         TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,                  -- when this analysis becomes stale
    is_current          BOOLEAN DEFAULT TRUE,
    UNIQUE(simpl_id, analysis_type, computed_at)
);

CREATE INDEX idx_analysis_current ON analysis_results(simpl_id, analysis_type) WHERE is_current = TRUE;
CREATE INDEX idx_analysis_severity ON analysis_results(severity) WHERE is_current = TRUE;

-- Historical snapshots for trend analysis / ML training
CREATE TABLE patient_snapshots (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    snapshot_date       DATE NOT NULL,
    active_conditions   JSONB,                        -- [{icd10, description}]
    active_medications  JSONB,                        -- [{name, rxnorm, directions}]
    latest_labs         JSONB,                        -- {HGB: {value, date}, ALB: {value, date}, ...}
    latest_vitals       JSONB,                        -- {bp: {sys, dia}, bloodSugar, painLevel}
    care_plan_focuses   JSONB,                        -- [{description, status}]
    risk_scores         JSONB,                        -- {foley: 0.7, gtube: 0.3, mtn: 0.5}
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, snapshot_date)
);

CREATE INDEX idx_snapshot_patient ON patient_snapshots(simpl_id, snapshot_date DESC);

-- Outcome tracking for ML training (foley placed, g-tube placed, etc.)
CREATE TABLE clinical_events (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    event_type          TEXT NOT NULL,                -- 'foley_placed', 'foley_removed', 'gtube_placed', 'mtn_started', 'transfusion', 'infusion'
    event_date          TIMESTAMPTZ,
    detected_from       TEXT,                         -- 'progress_note', 'condition', 'care_plan', 'assessment', 'manual'
    source_record_id    TEXT,                         -- ID of the source record
    confidence          NUMERIC,                      -- 0-1 for NLP-detected events
    verified            BOOLEAN DEFAULT FALSE,
    verified_by         TEXT,
    details             JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_patient ON clinical_events(simpl_id, event_type);
CREATE INDEX idx_events_type ON clinical_events(event_type, event_date DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Current patient status with latest analysis
CREATE VIEW v_patient_status AS
SELECT
    p.simpl_id,
    p.first_name,
    p.last_name,
    p.room,
    p.unit,
    p.last_synced_at,
    inf.severity AS infusion_severity,
    inf.score AS infusion_score,
    inf.reasoning AS infusion_reasoning,
    tran.severity AS transfusion_severity,
    tran.score AS transfusion_score,
    tran.reasoning AS transfusion_reasoning,
    foley.score AS foley_risk_score,
    gtube.score AS gtube_risk_score,
    mtn.score AS mtn_risk_score,
    GREATEST(
        CASE inf.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END,
        CASE tran.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END
    ) AS combined_urgency
FROM patients p
LEFT JOIN analysis_results inf ON inf.simpl_id = p.simpl_id AND inf.analysis_type = 'infusion' AND inf.is_current = TRUE
LEFT JOIN analysis_results tran ON tran.simpl_id = p.simpl_id AND tran.analysis_type = 'transfusion' AND tran.is_current = TRUE
LEFT JOIN analysis_results foley ON foley.simpl_id = p.simpl_id AND foley.analysis_type = 'foley_risk' AND foley.is_current = TRUE
LEFT JOIN analysis_results gtube ON gtube.simpl_id = p.simpl_id AND gtube.analysis_type = 'gtube_risk' AND gtube.is_current = TRUE
LEFT JOIN analysis_results mtn ON mtn.simpl_id = p.simpl_id AND mtn.analysis_type = 'mtn_risk' AND mtn.is_current = TRUE;

-- Latest labs for quick lookup
CREATE VIEW v_latest_labs AS
SELECT DISTINCT ON (simpl_id, observation_name)
    simpl_id,
    observation_name,
    value_numeric,
    unit,
    reference_range,
    is_abnormal,
    is_critical,
    effective_at,
    panel_name
FROM lab_results
ORDER BY simpl_id, observation_name, effective_at DESC;
