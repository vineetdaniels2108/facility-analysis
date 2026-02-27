/**
 * Extracts structured analysis inputs from raw PCC resource data.
 * Handles both properly formatted FHIR JSON (from live AWS) and gracefully
 * degrades when local cache data is malformed.
 */

export interface ExtractedPatientData {
    labs: Record<string, number>;       // e.g. { "Hemoglobin": 8.5, "Albumin": 3.1 }
    vitals: Record<string, number>;
    conditions: Array<Record<string, unknown>>;
    medications: Array<Record<string, unknown>>;
}

// Lab name normalizer — maps common variants to canonical names the Python backend expects
const LAB_ALIASES: Record<string, string> = {
    "hemoglobin": "Hemoglobin",
    "hgb": "Hemoglobin",
    "hematocrit": "Hematocrit",
    "hct": "Hematocrit",
    "ferritin": "Ferritin",
    "albumin": "Albumin",
    "alb": "Albumin",
    "bun": "BUN",
    "blood urea nitrogen": "BUN",
    "creatinine": "Creatinine",
    "cr": "Creatinine",
    "sodium": "Sodium",
    "na": "Sodium",
    "potassium": "Potassium",
    "k": "Potassium",
    "chloride": "Chloride",
    "cl": "Chloride",
    "co2": "CO2",
    "bicarbonate": "CO2",
    "carbon dioxide": "CO2",
    "anion gap": "Anion Gap",
    "glucose": "Glucose",
    "wbc": "WBC",
    "white blood cell": "WBC",
    "platelet": "Platelets",
    "plt": "Platelets",
    "inr": "INR",
    "prealbumin": "Prealbumin",
    "pre-albumin": "Prealbumin",
}

function normalizeLabName(raw: string): string | null {
    const lower = raw.toLowerCase().trim()
    for (const [alias, canonical] of Object.entries(LAB_ALIASES)) {
        if (lower.includes(alias)) return canonical
    }
    return null
}

function isProperObject(item: unknown): item is Record<string, unknown> {
    return typeof item === "object" && item !== null && !Array.isArray(item)
}

/**
 * Extract lab values from OBSERVATIONS resource data.
 * Returns empty dict if data is malformed (local cache issue).
 */
function extractLabs(observations: unknown): Record<string, number> {
    const labs: Record<string, number> = {}

    if (!Array.isArray(observations)) return labs

    for (const obs of observations) {
        if (!isProperObject(obs)) continue  // skip malformed strings

        // Get observation name from FHIR code field
        const code = obs.code as Record<string, unknown> | undefined
        const rawName = typeof code?.text === "string"
            ? code.text
            : (code?.coding as Array<{ display?: string }>)?.[0]?.display ?? ""

        const canonical = normalizeLabName(rawName)
        if (!canonical) continue

        // Get numeric value from valueQuantity
        const qty = obs.valueQuantity as Record<string, unknown> | undefined
        const val = qty?.value
        if (typeof val === "number" && !isNaN(val)) {
            labs[canonical] = val
        }
    }

    return labs
}

/**
 * Extract conditions list from DIAGNOSTICREPORTS or CONDITIONS resource data.
 */
function extractConditions(data: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(data)) return []
    return data.filter(isProperObject)
}

/**
 * Extract medications from MEDICATIONS resource data.
 */
function extractMedications(data: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(data)) return []
    return data.filter(isProperObject)
}

/**
 * Main extractor — takes a map of resource name → raw data and returns
 * structured inputs ready for the Python analysis backend.
 */
export function extractPatientData(
    resources: Record<string, unknown>
): ExtractedPatientData {
    const observations = resources["OBSERVATIONS"] ?? resources["observations"]
    const diagnosticReports = resources["DIAGNOSTICREPORTS"] ?? resources["diagnosticreports"]
    const medications = resources["MEDICATIONS"] ?? resources["medications"] ?? resources["MEDICATIONREQUESTS"]

    return {
        labs: extractLabs(observations),
        vitals: {},
        conditions: extractConditions(diagnosticReports),
        medications: extractMedications(medications),
    }
}
