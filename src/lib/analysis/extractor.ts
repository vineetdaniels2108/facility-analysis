/**
 * Extracts structured analysis inputs from raw PCC resource data.
 * Handles both FHIR-style JSON (from live AWS observations) and PCC native
 * format (diagnostic reports with testSet → results → observationName).
 */

export interface ExtractedPatientData {
    labs: Record<string, number>;       // e.g. { "Hemoglobin": 8.5, "Albumin": 3.1 }
    vitals: Record<string, number>;
    conditions: Array<Record<string, unknown>>;
    medications: Array<Record<string, unknown>>;
}

const LAB_ALIASES: Record<string, string> = {
    "hemoglobin": "Hemoglobin",
    "hgb": "Hemoglobin",
    "hematocrit": "Hematocrit",
    "hct": "Hematocrit",
    "ferritin": "Ferritin",
    "albumin": "Albumin",
    "alb": "Albumin",
    "prealbumin": "Prealbumin",
    "pre-albumin": "Prealbumin",
    "bun": "BUN",
    "blood urea nitrogen": "BUN",
    "urea nitrogen": "BUN",
    "creatinine": "Creatinine",
    "cr": "Creatinine",
    "sodium": "Sodium",
    "na": "Sodium",
    "potassium": "Potassium",
    "k": "Potassium",
    "chloride": "Chloride",
    "cl": "Chloride",
    "co2": "CO2",
    "carbon dioxide": "CO2",
    "bicarbonate": "CO2",
    "anion gap": "Anion Gap",
    "glucose": "Glucose",
    "wbc": "WBC",
    "white blood cell": "WBC",
    "platelet": "Platelets",
    "plt": "Platelets",
    "inr": "INR",
    "hemoglobin a1c": "HbA1c",
    "a1c": "HbA1c",
    "magnesium": "Magnesium",
    "phosphorus": "Phosphorus",
    "calcium": "Calcium",
    "vitamin d": "Vitamin D",
    "vitamin b12": "Vitamin B12",
    "folate": "Folate",
    "tsh": "TSH",
    "iron": "Iron",
    "tibc": "TIBC",
    "transferrin": "Transferrin",
}

function normalizeLabName(raw: string): string | null {
    const lower = raw.toLowerCase().trim()
    // Exact match first
    if (LAB_ALIASES[lower]) return LAB_ALIASES[lower]
    // Substring match
    for (const [alias, canonical] of Object.entries(LAB_ALIASES)) {
        if (lower.includes(alias)) return canonical
    }
    return null
}

/**
 * Parse a numeric value from a string like "10.5" or "10.5 g/dL".
 * Returns null for non-numeric values like "See Attachment", "Negative", etc.
 */
function parseNumericValue(raw: unknown): number | null {
    if (typeof raw === "number" && !isNaN(raw)) return raw
    if (typeof raw !== "string") return null
    const s = raw.trim()
    if (!s || /^[a-z]/i.test(s) && !/^\d/.test(s)) return null
    const match = s.match(/^[-+]?\d*\.?\d+/)
    if (!match) return null
    const n = parseFloat(match[0])
    return isNaN(n) ? null : n
}

function isProperObject(item: unknown): item is Record<string, unknown> {
    return typeof item === "object" && item !== null && !Array.isArray(item)
}

// ─── FHIR-style observations (code.text + valueQuantity.value as number) ─────

function extractLabsFromFhirObservations(observations: unknown, labs: Record<string, number>) {
    if (!Array.isArray(observations)) return

    for (const obs of observations) {
        if (!isProperObject(obs)) continue

        const code = obs.code as Record<string, unknown> | undefined
        const rawName = typeof code?.text === "string"
            ? code.text
            : (code?.coding as Array<{ display?: string }>)?.[0]?.display ?? ""

        const canonical = normalizeLabName(rawName)
        if (!canonical) continue

        const qty = obs.valueQuantity as Record<string, unknown> | undefined
        const val = parseNumericValue(qty?.value)
        if (val !== null) {
            labs[canonical] = val
        }
    }
}

// ─── PCC native format: diagnostic reports with testSet → results ────────────

function extractLabsFromPccReports(reports: unknown, labs: Record<string, number>) {
    if (!Array.isArray(reports)) return

    for (const report of reports) {
        if (!isProperObject(report)) continue

        const testSets = report.testSet as Array<Record<string, unknown>> | undefined
        if (!Array.isArray(testSets)) continue

        for (const testSet of testSets) {
            if (!isProperObject(testSet)) continue

            const results = testSet.results as Array<Record<string, unknown>> | undefined
            if (!Array.isArray(results)) continue

            for (const result of results) {
                if (!isProperObject(result)) continue

                const obsName = (result.observationName as string)
                    ?? (result.codeDescription as string)
                    ?? ""
                const canonical = normalizeLabName(obsName)
                if (!canonical) continue

                // PCC stores valueQuantity.value as a string like "10.5"
                const valQty = result.valueQuantity as Record<string, unknown> | undefined
                const val = parseNumericValue(valQty?.value)
                if (val !== null) {
                    labs[canonical] = val
                }
            }
        }
    }
}

// ─── PCC native observations (flat array with observationName) ───────────────

function extractLabsFromPccObservations(observations: unknown, labs: Record<string, number>) {
    if (!Array.isArray(observations)) return

    for (const obs of observations) {
        if (!isProperObject(obs)) continue

        // PCC flat observation: { observationName: "Hemoglobin", valueQuantity: { value: "10.5" } }
        const obsName = (obs.observationName as string) ?? ""
        if (obsName) {
            const canonical = normalizeLabName(obsName)
            if (!canonical) continue
            const valQty = obs.valueQuantity as Record<string, unknown> | undefined
            const val = parseNumericValue(valQty?.value)
            if (val !== null) {
                labs[canonical] = val
                continue
            }
        }

        // Also check nested testSet within an observation (some resources nest this way)
        const testSets = obs.testSet as Array<Record<string, unknown>> | undefined
        if (Array.isArray(testSets)) {
            extractLabsFromPccReports([obs], labs)
        }
    }
}

// ─── Conditions extraction ───────────────────────────────────────────────────

function extractConditions(data: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(data)) return []
    return data.filter(isProperObject)
}

// ─── Medications extraction ──────────────────────────────────────────────────

function extractMedications(data: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(data)) return []
    return data.filter(isProperObject)
}

// ─── Main extractor ─────────────────────────────────────────────────────────

export function extractPatientData(
    resources: Record<string, unknown>
): ExtractedPatientData {
    const observations = resources["OBSERVATIONS"] ?? resources["observations"]
    const diagnosticReports = resources["DIAGNOSTICREPORTS"] ?? resources["diagnosticreports"]
    const medications = resources["MEDICATIONS"] ?? resources["medications"]
        ?? resources["MEDICATIONREQUESTS"] ?? resources["medicationrequests"]
    const conditions = resources["CONDITIONS"] ?? resources["conditions"]

    const labs: Record<string, number> = {}

    // Extract labs from all possible data shapes and sources
    extractLabsFromFhirObservations(observations, labs)
    extractLabsFromPccObservations(observations, labs)
    extractLabsFromPccReports(diagnosticReports, labs)

    return {
        labs,
        vitals: {},
        conditions: extractConditions(conditions ?? diagnosticReports),
        medications: extractMedications(medications),
    }
}
