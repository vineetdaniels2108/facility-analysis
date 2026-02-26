import { PoolClient } from 'pg';
import { PccDiagnosticReport, PccLabResult, SyncResult } from '../types';

// Common lab name normalizations for consistent querying
const NAME_ALIASES: Record<string, string> = {
    'Hemoglobin': 'HGB', 'HEMOGLOBIN': 'HGB',
    'Hematocrit': 'HCT', 'HEMATOCRIT': 'HCT',
    'Albumin': 'ALB', 'ALBUMIN': 'ALB',
    'Prealbumin': 'PREALB', 'Pre-Albumin': 'PREALB', 'PREALBUMIN': 'PREALB',
    'Creatinine': 'CREAT', 'CREATININE': 'CREAT',
    'BUN': 'BUN', 'Blood Urea Nitrogen': 'BUN',
    'Sodium': 'NA', 'SODIUM': 'NA',
    'Potassium': 'K', 'POTASSIUM': 'K',
    'Glucose': 'GLU', 'GLUCOSE': 'GLU',
    'WBC': 'WBC', 'White Blood Cell': 'WBC',
    'Platelets': 'PLT', 'PLATELETS': 'PLT',
    'MCH': 'MCH', 'MCV': 'MCV', 'MCHC': 'MCHC',
    'RBC': 'RBC', 'INR': 'INR',
    'Magnesium': 'MG', 'MAGNESIUM': 'MG',
    'Calcium': 'CA', 'CALCIUM': 'CA',
    'Phosphorus': 'PHOS', 'PHOSPHORUS': 'PHOS',
    'TSH': 'TSH', 'Free T4': 'FT4', 'Free T3': 'FT3',
    'Vitamin D': 'VITD', 'Vitamin B12': 'B12',
    'Folate': 'FOLATE', 'Iron': 'FE',
    'HbA1c': 'HBA1C', 'Hemoglobin A1c': 'HBA1C',
    'Total Protein': 'TPROT', 'C-Reactive Protein': 'CRP',
};

function normalizeName(raw?: string): string {
    if (!raw) return 'UNKNOWN';
    return NAME_ALIASES[raw] ?? raw.toUpperCase().replace(/\s+/g, '_').slice(0, 50);
}

function parseNumeric(val?: string | number): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[<>]/g, ''));
    return isNaN(n) ? null : n;
}

function parseRefRange(range?: string): { low: number | null; high: number | null } {
    if (!range) return { low: null, high: null };
    const match = range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
    if (match) return { low: parseFloat(match[1]), high: parseFloat(match[2]) };
    return { low: null, high: null };
}

function isAbnormal(value: number | null, low: number | null, high: number | null): boolean {
    if (value === null) return false;
    if (low !== null && value < low) return true;
    if (high !== null && value > high) return true;
    return false;
}

function isCritical(value: number | null, name: string): boolean {
    if (value === null) return false;
    const criticalThresholds: Record<string, [number, number]> = {
        'HGB':  [6.5, 20],
        'HCT':  [20, 60],
        'PLT':  [50, 1000],
        'NA':   [120, 160],
        'K':    [2.5, 6.5],
        'GLU':  [50, 500],
        'CREAT':[0, 10],
        'INR':  [0, 5],
    };
    const thresholds = criticalThresholds[name];
    if (!thresholds) return false;
    return value < thresholds[0] || value > thresholds[1];
}

export async function syncLabs(
    client: PoolClient,
    simplId: string,
    reports: PccDiagnosticReport[]
): Promise<SyncResult> {
    const start = Date.now();
    let synced = 0;
    let errors = 0;

    for (const report of reports) {
        // Upsert diagnostic report
        try {
            await client.query(
                `INSERT INTO diagnostic_reports
                    (simpl_id, report_id, report_name, report_type, report_status,
                     categories, reporting_lab, performing_lab, ordering_provider,
                     effective_at, issued_at, has_report_file, raw_data)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                 ON CONFLICT (simpl_id, report_id) DO UPDATE SET
                    report_name      = EXCLUDED.report_name,
                    report_status    = EXCLUDED.report_status,
                    categories       = EXCLUDED.categories,
                    effective_at     = EXCLUDED.effective_at,
                    raw_data         = EXCLUDED.raw_data,
                    synced_at        = NOW()`,
                [
                    simplId,
                    report.reportId,
                    report.reportName,
                    report.reportType,
                    report.reportStatus,
                    report.category ?? [],
                    report.reportingLaboratory,
                    report.performingLaboratory,
                    JSON.stringify(report.orderingPractitioner ?? {}),
                    report.effectiveDateTime ?? null,
                    report.issuedDateTime ?? null,
                    report.reportFile ?? false,
                    JSON.stringify(report),
                ]
            );
        } catch (err) {
            console.error(`[sync/labs] report upsert error ${report.reportId}:`, err);
            errors++;
            continue;
        }

        // Flatten and upsert each lab result
        for (const testSet of report.testSet ?? []) {
            for (const result of testSet.results ?? []) {
                try {
                    await upsertLabResult(client, simplId, report, testSet.panelName, result);
                    synced++;
                } catch (err) {
                    console.error(`[sync/labs] result upsert error:`, err);
                    errors++;
                }
            }
        }
    }

    return { resource: 'DIAGNOSTICREPORTS', synced, skipped: 0, errors, durationMs: Date.now() - start };
}

async function upsertLabResult(
    client: PoolClient,
    simplId: string,
    report: PccDiagnosticReport,
    panelName: string | undefined,
    result: PccLabResult
) {
    const obsId = result.observationId ?? `${report.reportId}-${result.code}`;
    const rawName = result.observationName ?? result.codeDescription;
    const name = normalizeName(rawName);
    const numeric = parseNumeric(result.valueQuantity?.value);
    const { low, high } = parseRefRange(result.referenceRange);
    const loinc = result.code && result.codeSystem === 'LOINC' ? result.code : null;

    await client.query(
        `INSERT INTO lab_results
            (simpl_id, report_id, panel_name, observation_id, observation_name,
             loinc_code, loinc_description, result_status, value_numeric, value_text,
             unit, reference_range, ref_low, ref_high, is_abnormal, is_critical,
             comment, effective_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (simpl_id, report_id, observation_id) DO UPDATE SET
            value_numeric   = EXCLUDED.value_numeric,
            value_text      = EXCLUDED.value_text,
            is_abnormal     = EXCLUDED.is_abnormal,
            is_critical     = EXCLUDED.is_critical,
            result_status   = EXCLUDED.result_status,
            synced_at       = NOW()`,
        [
            simplId,
            report.reportId,
            panelName,
            obsId,
            name,
            loinc,
            result.codeDescription,
            result.resultStatus,
            numeric,
            String(result.valueQuantity?.value ?? ''),
            result.valueQuantity?.unitText,
            result.referenceRange,
            low,
            high,
            isAbnormal(numeric, low, high),
            isCritical(numeric, name),
            result.comment,
            report.effectiveDateTime ?? null,
        ]
    );
}
