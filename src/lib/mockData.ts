// src/lib/mockData.ts

export const MOCK_PATIENTS = [
    { id: "P1", name: "Patient A7B2", age: 74, gender: "F", admissionDate: "2025-09-15", currentStatus: "Stable" },
    { id: "P2", name: "Patient C9D4", age: 62, gender: "M", admissionDate: "2025-09-21", currentStatus: "Critical" },
    { id: "P3", name: "Patient E1F8", age: 81, gender: "F", admissionDate: "2025-10-02", currentStatus: "Review Required" },
    { id: "P4", name: "Patient G3H6", age: 58, gender: "M", admissionDate: "2025-10-05", currentStatus: "Stable" },
]

export const MOCK_PDPM_RESULTS = [
    { patientId: "P1", ptScore: "TC", otScore: "TC", slpScore: "SH", nursingScore: "HDE2", ntaScore: "NC", totalPoints: 12 },
    { patientId: "P2", ptScore: "TH", otScore: "TH", slpScore: "SA", nursingScore: "LBC1", ntaScore: "NF", totalPoints: 2 },
    { patientId: "P3", ptScore: "TA", otScore: "TA", slpScore: "SL", nursingScore: "ES3", ntaScore: "NA", totalPoints: 18 },
]

export const MOCK_INFUSION_CANDIDATES = [
    { patientId: "P2", recommendation: "IV Rocephin for severe UTI", priority: "High", reason: "Urine culture positive for E. Coli, oral antibiotics failed." },
    { patientId: "P3", recommendation: "IV Fluid Resuscitation", priority: "Medium", reason: "BUN/Creatinine ratio elevated, decreased skin turgor." },
]

export const MOCK_CARE_GAPS = [
    { patientId: "P1", gap: "Missing Annual A1C", recommendedAction: "Schedule Lab Draw" },
    { patientId: "P4", gap: "Overdue for PHQ-9 Depression Screen", recommendedAction: "Assign to Social Service" },
]
