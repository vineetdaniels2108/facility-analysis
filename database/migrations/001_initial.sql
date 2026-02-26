-- Migration 001: Initial schema
-- Run with: psql $DATABASE_URL -f database/migrations/001_initial.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations & Facilities ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
    id              SERIAL PRIMARY KEY,
    org_id          BIGINT UNIQUE NOT NULL,
    org_uuid        TEXT UNIQUE,
    name            TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facilities (
    id              SERIAL PRIMARY KEY,
    org_id          BIGINT REFERENCES organizations(org_id),
    fac_id          INT NOT NULL,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, fac_id)
);

-- ── Client Configuration ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id                  SERIAL PRIMARY KEY,
    client_key          TEXT UNIQUE NOT NULL,        -- e.g. "baywood_healthcare"
    name                TEXT NOT NULL,
    fac_ids             INT[],                        -- facility IDs belonging to this client
    enabled_modules     TEXT[],                       -- ["infusion","transfusion","foley_risk",...]
    module_config       JSONB DEFAULT '{}',           -- per-module threshold overrides
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: default client
INSERT INTO clients (client_key, name, fac_ids, enabled_modules) VALUES
(
    'baywood_healthcare',
    'Baywood Crossing Rehab and Healthcare',
    ARRAY[121, 1],
    ARRAY['infusion', 'transfusion', 'foley_risk', 'gtube_risk', 'mtn_risk']
)
ON CONFLICT (client_key) DO NOTHING;

-- ── Patients ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id              SERIAL PRIMARY KEY,
    simpl_id        UUID UNIQUE NOT NULL,
    pcc_patient_id  BIGINT,
    first_name      TEXT,
    last_name       TEXT,
    date_of_birth   DATE,
    gender          TEXT,
    fac_id          INT,
    room            TEXT,
    bed             TEXT,
    unit            TEXT,
    floor           TEXT,
    admit_date      DATE,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_simpl ON patients(simpl_id);
CREATE INDEX IF NOT EXISTS idx_patients_fac   ON patients(fac_id);

-- ── Sync Tracking ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
    id              SERIAL PRIMARY KEY,
    simpl_id        UUID REFERENCES patients(simpl_id),
    resource_type   TEXT NOT NULL,
    records_synced  INT DEFAULT 0,
    status          TEXT DEFAULT 'success',
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_patient ON sync_log(simpl_id, resource_type);

-- ── Diagnostic Reports ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_reports (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    report_id           TEXT NOT NULL,
    report_name         TEXT,
    report_type         TEXT,
    report_status       TEXT,
    categories          TEXT[],
    reporting_lab       TEXT,
    performing_lab      TEXT,
    ordering_provider   JSONB,
    effective_at        TIMESTAMPTZ,
    issued_at           TIMESTAMPTZ,
    has_report_file     BOOLEAN DEFAULT FALSE,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, report_id)
);

CREATE INDEX IF NOT EXISTS idx_diag_patient    ON diagnostic_reports(simpl_id);
CREATE INDEX IF NOT EXISTS idx_diag_effective  ON diagnostic_reports(simpl_id, effective_at DESC);

-- ── Lab Results ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_results (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    report_id           TEXT NOT NULL,
    panel_name          TEXT,
    observation_id      TEXT,
    observation_name    TEXT,
    loinc_code          TEXT,
    loinc_description   TEXT,
    result_status       TEXT,
    value_numeric       NUMERIC,
    value_text          TEXT,
    unit                TEXT,
    reference_range     TEXT,
    ref_low             NUMERIC,
    ref_high            NUMERIC,
    is_abnormal         BOOLEAN,
    is_critical         BOOLEAN,
    comment             TEXT,
    effective_at        TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, report_id, observation_id)
);

CREATE INDEX IF NOT EXISTS idx_labs_patient   ON lab_results(simpl_id);
CREATE INDEX IF NOT EXISTS idx_labs_name      ON lab_results(simpl_id, observation_name);
CREATE INDEX IF NOT EXISTS idx_labs_date      ON lab_results(simpl_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_labs_loinc     ON lab_results(loinc_code);
CREATE INDEX IF NOT EXISTS idx_labs_abnormal  ON lab_results(simpl_id, is_abnormal) WHERE is_abnormal = TRUE;

-- ── Conditions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conditions (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    condition_id        BIGINT NOT NULL,
    snomed_code         TEXT,
    snomed_display      TEXT,
    icd10_code          TEXT,
    icd10_description   TEXT,
    onset_date          DATE,
    clinical_status     TEXT,
    rank_description    TEXT,
    classification      TEXT,
    is_principal        BOOLEAN DEFAULT FALSE,
    is_therapy          BOOLEAN DEFAULT FALSE,
    created_by          TEXT,
    condition_created_at TIMESTAMPTZ,
    revised_by          TEXT,
    revised_at          TIMESTAMPTZ,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, condition_id)
);

CREATE INDEX IF NOT EXISTS idx_conditions_patient ON conditions(simpl_id);
CREATE INDEX IF NOT EXISTS idx_conditions_icd10   ON conditions(icd10_code);
CREATE INDEX IF NOT EXISTS idx_conditions_active  ON conditions(simpl_id, clinical_status) WHERE clinical_status = 'ACTIVE';

-- ── Medications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    order_id            BIGINT NOT NULL,
    description         TEXT,
    generic_name        TEXT,
    strength            TEXT,
    strength_uom        TEXT,
    rxnorm_id           TEXT,
    directions          TEXT,
    route_code          TEXT,
    route_display       TEXT,
    status              TEXT,
    is_narcotic         BOOLEAN DEFAULT FALSE,
    controlled_sub_code TEXT,
    start_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,
    order_date          TIMESTAMPTZ,
    discontinue_date    TIMESTAMPTZ,
    resident_name       TEXT,
    created_by          TEXT,
    med_created_at      TIMESTAMPTZ,
    revised_by          TEXT,
    revised_at          TIMESTAMPTZ,
    schedules           JSONB,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_meds_patient ON medications(simpl_id);
CREATE INDEX IF NOT EXISTS idx_meds_active  ON medications(simpl_id, status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_meds_rxnorm  ON medications(rxnorm_id);

-- ── Observations (Vitals) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS observations (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    observation_id      BIGINT NOT NULL,
    type                TEXT NOT NULL,
    value               NUMERIC,
    unit                TEXT,
    systolic_value      INT,
    diastolic_value     INT,
    method              TEXT,
    loinc_code          TEXT,
    recorded_at         TIMESTAMPTZ,
    recorded_by         TEXT,
    is_struck_out       BOOLEAN DEFAULT FALSE,
    warnings            JSONB,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, observation_id)
);

CREATE INDEX IF NOT EXISTS idx_obs_patient ON observations(simpl_id);
CREATE INDEX IF NOT EXISTS idx_obs_type    ON observations(simpl_id, type, recorded_at DESC);

-- ── Assessments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    assessment_id       BIGINT NOT NULL,
    description         TEXT,
    assessment_type     TEXT,
    status              TEXT,
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

CREATE INDEX IF NOT EXISTS idx_assess_patient ON assessments(simpl_id);
CREATE INDEX IF NOT EXISTS idx_assess_type    ON assessments(simpl_id, description);
CREATE INDEX IF NOT EXISTS idx_assess_date    ON assessments(simpl_id, ref_date DESC);

-- ── Care Plans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS care_plans (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    care_plan_id        BIGINT NOT NULL,
    status              TEXT,
    next_review_date    TIMESTAMPTZ,
    created_by          TEXT,
    plan_created_at     TIMESTAMPTZ,
    revised_by          TEXT,
    revised_at          TIMESTAMPTZ,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, care_plan_id)
);

CREATE TABLE IF NOT EXISTS care_plan_focuses (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    care_plan_id        BIGINT NOT NULL,
    focus_id            BIGINT NOT NULL,
    description         TEXT,
    status              TEXT,
    focus_created_at    TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, care_plan_id, focus_id)
);

CREATE INDEX IF NOT EXISTS idx_cpf_patient ON care_plan_focuses(simpl_id);
CREATE INDEX IF NOT EXISTS idx_cpf_active  ON care_plan_focuses(simpl_id, status) WHERE status = 'Active';
CREATE INDEX IF NOT EXISTS idx_cpf_search  ON care_plan_focuses USING GIN (to_tsvector('english', COALESCE(description, '')));

-- ── Progress Notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS progress_notes (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    note_id             BIGINT NOT NULL,
    note_type           TEXT,
    effective_at        TIMESTAMPTZ,
    note_created_at     TIMESTAMPTZ,
    created_by          TEXT,
    loinc_code          TEXT,
    follow_up_to_id     BIGINT,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, note_id)
);

CREATE TABLE IF NOT EXISTS progress_note_sections (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    note_id             BIGINT NOT NULL,
    section_name        TEXT,
    section_value       TEXT,
    synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pns_patient ON progress_note_sections(simpl_id);
CREATE INDEX IF NOT EXISTS idx_pns_note    ON progress_note_sections(note_id);
CREATE INDEX IF NOT EXISTS idx_pns_search  ON progress_note_sections USING GIN (to_tsvector('english', COALESCE(section_value, '')));

-- ── ADT Records ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS adt_records (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    adt_record_id       BIGINT NOT NULL,
    action_type         TEXT,
    action_code         TEXT,
    standard_action     TEXT,
    payer_name          TEXT,
    payer_type          TEXT,
    payer_code          TEXT,
    room                TEXT,
    bed                 TEXT,
    unit                TEXT,
    floor               TEXT,
    is_outpatient       BOOLEAN DEFAULT FALSE,
    admission_source    TEXT,
    admission_type      TEXT,
    origin              TEXT,
    origin_type         TEXT,
    destination         TEXT,
    destination_type    TEXT,
    discharge_status    TEXT,
    transfer_reason     TEXT,
    effective_at        TIMESTAMPTZ,
    entered_at          TIMESTAMPTZ,
    entered_by          TEXT,
    is_cancelled        BOOLEAN DEFAULT FALSE,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, adt_record_id)
);

CREATE INDEX IF NOT EXISTS idx_adt_patient ON adt_records(simpl_id);
CREATE INDEX IF NOT EXISTS idx_adt_date    ON adt_records(simpl_id, effective_at DESC);

-- ── Allergies ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allergies (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    allergy_id          BIGINT NOT NULL,
    allergen            TEXT,
    allergen_snomed     TEXT,
    allergen_rxnorm     TEXT,
    category            TEXT,
    allergy_type        TEXT,
    clinical_status     TEXT,
    severity            TEXT,
    onset_date          DATE,
    created_by          TEXT,
    allergy_created_at  TIMESTAMPTZ,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, allergy_id)
);

CREATE INDEX IF NOT EXISTS idx_allergy_patient ON allergies(simpl_id);

-- ── Immunizations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS immunizations (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    immunization_id     BIGINT NOT NULL,
    name                TEXT,
    cvx_code            TEXT,
    cvx_description     TEXT,
    consent_status      TEXT,
    was_given           BOOLEAN DEFAULT FALSE,
    administered_at     TIMESTAMPTZ,
    route               TEXT,
    location_given      TEXT,
    dose_value          NUMERIC,
    dose_unit           TEXT,
    manufacturer        TEXT,
    lot_number          TEXT,
    expiration_date     DATE,
    administered_by     TEXT,
    reason_refused      TEXT,
    results             TEXT,
    created_at          TIMESTAMPTZ,
    created_by          TEXT,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, immunization_id)
);

CREATE INDEX IF NOT EXISTS idx_immun_patient ON immunizations(simpl_id);

-- ── Coverages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coverages (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    coverage_id         BIGINT NOT NULL,
    effective_from      TIMESTAMPTZ,
    primary_payer_name  TEXT,
    primary_payer_type  TEXT,
    payers              JSONB,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, coverage_id)
);

CREATE INDEX IF NOT EXISTS idx_coverage_patient ON coverages(simpl_id);

-- ── Analysis Results ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis_results (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    analysis_type       TEXT NOT NULL,
    severity            TEXT,
    score               NUMERIC,
    priority            TEXT,
    reasoning           TEXT,
    key_indicators      JSONB,
    computed_at         TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    is_current          BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_analysis_current  ON analysis_results(simpl_id, analysis_type) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_analysis_severity ON analysis_results(severity, analysis_type) WHERE is_current = TRUE;

-- ── Clinical Events (ML training labels) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_events (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    event_type          TEXT NOT NULL,
    event_date          TIMESTAMPTZ,
    detected_from       TEXT,
    source_record_id    TEXT,
    confidence          NUMERIC,
    verified            BOOLEAN DEFAULT FALSE,
    verified_by         TEXT,
    details             JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_patient ON clinical_events(simpl_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_type    ON clinical_events(event_type, event_date DESC);

-- ── Patient Snapshots (daily state for trend analysis) ────────────────────
CREATE TABLE IF NOT EXISTS patient_snapshots (
    id                  SERIAL PRIMARY KEY,
    simpl_id            UUID NOT NULL REFERENCES patients(simpl_id),
    snapshot_date       DATE NOT NULL,
    active_conditions   JSONB,
    active_medications  JSONB,
    latest_labs         JSONB,
    latest_vitals       JSONB,
    care_plan_focuses   JSONB,
    risk_scores         JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(simpl_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_patient ON patient_snapshots(simpl_id, snapshot_date DESC);

-- ── Views ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_patient_status AS
SELECT
    p.simpl_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    p.fac_id,
    p.room,
    p.bed,
    p.unit,
    p.admit_date,
    p.last_synced_at,
    inf.severity        AS infusion_severity,
    inf.score           AS infusion_score,
    inf.priority        AS infusion_priority,
    inf.reasoning       AS infusion_reasoning,
    inf.key_indicators  AS infusion_indicators,
    tran.severity       AS transfusion_severity,
    tran.score          AS transfusion_score,
    tran.priority       AS transfusion_priority,
    tran.reasoning      AS transfusion_reasoning,
    tran.key_indicators AS transfusion_indicators,
    foley.score         AS foley_risk_score,
    foley.reasoning     AS foley_risk_reasoning,
    gtube.score         AS gtube_risk_score,
    gtube.reasoning     AS gtube_risk_reasoning,
    mtn.score           AS mtn_risk_score,
    mtn.reasoning       AS mtn_risk_reasoning,
    GREATEST(
        CASE inf.severity  WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END,
        CASE tran.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END
    ) AS combined_urgency
FROM patients p
LEFT JOIN analysis_results inf   ON inf.simpl_id   = p.simpl_id AND inf.analysis_type   = 'infusion'      AND inf.is_current   = TRUE
LEFT JOIN analysis_results tran  ON tran.simpl_id  = p.simpl_id AND tran.analysis_type  = 'transfusion'   AND tran.is_current  = TRUE
LEFT JOIN analysis_results foley ON foley.simpl_id = p.simpl_id AND foley.analysis_type = 'foley_risk'    AND foley.is_current = TRUE
LEFT JOIN analysis_results gtube ON gtube.simpl_id = p.simpl_id AND gtube.analysis_type = 'gtube_risk'    AND gtube.is_current = TRUE
LEFT JOIN analysis_results mtn   ON mtn.simpl_id   = p.simpl_id AND mtn.analysis_type   = 'mtn_risk'      AND mtn.is_current   = TRUE;

CREATE OR REPLACE VIEW v_latest_labs AS
SELECT DISTINCT ON (simpl_id, observation_name)
    simpl_id,
    observation_name,
    value_numeric,
    unit,
    reference_range,
    ref_low,
    ref_high,
    is_abnormal,
    is_critical,
    effective_at,
    panel_name
FROM lab_results
ORDER BY simpl_id, observation_name, effective_at DESC;
