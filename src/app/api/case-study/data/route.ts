import { NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for large queries

// ─── Facility groupings ────────────────────────────────────────────────────
const VELLUM_FACILITIES = [121, 2, 3]; // Named: Baywood, Trinity, Barnegat
const NON_VELLUM_FACILITIES = [4, 14, 16, 21, 30, 32]; // Anonymized: A–F
const ALL_FACILITIES = [...VELLUM_FACILITIES, ...NON_VELLUM_FACILITIES];

const FACILITY_ALIASES: Record<number, string> = {
    121: 'Baywood Crossing Rehab and Healthcare',
    2: 'Trinity Rehabilitation and Healthcare Center',
    3: 'Barnegat Rehab and Nursing Center',
    4: 'Facility A', 14: 'Facility B', 16: 'Facility C',
    21: 'Facility D', 30: 'Facility E', 32: 'Facility F',
};

// Wound care ICD-10 codes
const WOUND_CODES_PREFIX = ['L89', 'L97', 'L98.4', 'T81.3']; // pressure ulcers, chronic ulcers, non-healing surgical

// ─── Core query functions ──────────────────────────────────────────────────

/** 1. ADT Transfer Analysis — the heart of the case study */
async function getTransferAnalysis(facId: number) {
    // All ADT records for this facility (non-cancelled)
    const adtRes = await query<{
        simpl_id: string;
        adt_record_id: number;
        action_type: string;
        action_code: string;
        standard_action: string;
        destination: string;
        destination_type: string;
        origin: string;
        origin_type: string;
        transfer_reason: string;
        discharge_status: string;
        effective_at: string;
        is_outpatient: boolean;
    }>(`
        SELECT a.simpl_id, a.adt_record_id, a.action_type, a.action_code,
               a.standard_action, a.destination, a.destination_type,
               a.origin, a.origin_type, a.transfer_reason, a.discharge_status,
               a.effective_at::text, a.is_outpatient
        FROM adt_records a
        JOIN patients p ON p.simpl_id = a.simpl_id
        WHERE p.fac_id = $1
          AND a.is_cancelled = FALSE
        ORDER BY a.simpl_id, a.effective_at
    `, [facId]);

    const records = adtRes.rows;

    // Identify acute hospital transfers
    const acuteTransfers = records.filter(r =>
        (r.destination_type?.toLowerCase().includes('acute') ||
         r.destination_type?.toLowerCase().includes('hospital') ||
         r.destination?.toLowerCase().includes('hospital') ||
         r.discharge_status?.toLowerCase().includes('acute') ||
         r.action_type?.toLowerCase().includes('discharge') ||
         r.standard_action?.toLowerCase().includes('discharge'))
        &&
        (r.destination_type?.toLowerCase().includes('acute') ||
         r.destination_type?.toLowerCase().includes('hospital') ||
         r.destination?.toLowerCase().includes('hospital'))
    );

    // Group by patient to calculate days out
    const patientTransfers: Record<string, typeof acuteTransfers> = {};
    for (const t of acuteTransfers) {
        if (!patientTransfers[t.simpl_id]) patientTransfers[t.simpl_id] = [];
        patientTransfers[t.simpl_id].push(t);
    }

    // Calculate days out: find pairs of discharge-to-hospital → readmit-to-facility
    let totalDaysOut = 0;
    let transfersWithReturn = 0;
    const daysOutList: number[] = [];

    for (const [sid, transfers] of Object.entries(patientTransfers)) {
        const allPatientRecords = records.filter(r => r.simpl_id === sid);
        for (const transfer of transfers) {
            const transferDate = new Date(transfer.effective_at);
            // Find next admission/readmission record for this patient after the transfer
            const returnRecord = allPatientRecords.find(r =>
                new Date(r.effective_at) > transferDate &&
                (r.action_type?.toLowerCase().includes('admission') ||
                 r.action_type?.toLowerCase().includes('readmission') ||
                 r.standard_action?.toLowerCase().includes('admission') ||
                 r.action_code?.toLowerCase().includes('admit'))
            );
            if (returnRecord) {
                const returnDate = new Date(returnRecord.effective_at);
                const daysOut = Math.max(1, Math.round((returnDate.getTime() - transferDate.getTime()) / 86400000));
                totalDaysOut += daysOut;
                daysOutList.push(daysOut);
                transfersWithReturn++;
            }
        }
    }

    const avgDaysOut = daysOutList.length > 0
        ? Math.round((daysOutList.reduce((a, b) => a + b, 0) / daysOutList.length) * 10) / 10
        : null;

    // Transfer reasons breakdown
    const reasonCounts: Record<string, number> = {};
    for (const t of acuteTransfers) {
        const reason = t.transfer_reason || t.discharge_status || 'Unknown';
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }

    // Destination breakdown
    const destinationCounts: Record<string, number> = {};
    for (const t of acuteTransfers) {
        const dest = t.destination || 'Unknown Hospital';
        destinationCounts[dest] = (destinationCounts[dest] || 0) + 1;
    }

    // All unique action types (for debugging/understanding the data)
    const actionTypes = [...new Set(records.map(r => r.action_type).filter(Boolean))];
    const standardActions = [...new Set(records.map(r => r.standard_action).filter(Boolean))];
    const destinationTypes = [...new Set(records.map(r => r.destination_type).filter(Boolean))];

    return {
        totalAdtRecords: records.length,
        acuteHospitalTransfers: acuteTransfers.length,
        uniquePatientsTransferred: Object.keys(patientTransfers).length,
        transfersWithReturn,
        totalDaysOut,
        avgDaysOut,
        daysOutDistribution: daysOutList.sort((a, b) => a - b),
        transferReasons: Object.entries(reasonCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([reason, count]) => ({ reason, count })),
        destinations: Object.entries(destinationCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([destination, count]) => ({ destination, count })),
        // Debug info
        _actionTypes: actionTypes,
        _standardActions: standardActions,
        _destinationTypes: destinationTypes,
    };
}

/** 2. Lab-based infusion/transfusion opportunity analysis */
async function getLabAnalysis(facId: number) {
    // Transfusion opportunities: HGB < 8.0
    const transfusionRes = await query<{
        simpl_id: string;
        value_numeric: number;
        effective_at: string;
        observation_name: string;
    }>(`
        SELECT lr.simpl_id, lr.value_numeric, lr.effective_at::text, lr.observation_name
        FROM lab_results lr
        JOIN patients p ON p.simpl_id = lr.simpl_id
        WHERE p.fac_id = $1
          AND lr.observation_name = 'HGB'
          AND lr.value_numeric IS NOT NULL
          AND lr.value_numeric < 8.0
        ORDER BY lr.effective_at DESC
    `, [facId]);

    // Infusion opportunities: ALB < 3.0
    const infusionRes = await query<{
        simpl_id: string;
        value_numeric: number;
        effective_at: string;
        observation_name: string;
    }>(`
        SELECT lr.simpl_id, lr.value_numeric, lr.effective_at::text, lr.observation_name
        FROM lab_results lr
        JOIN patients p ON p.simpl_id = lr.simpl_id
        WHERE p.fac_id = $1
          AND lr.observation_name = 'ALB'
          AND lr.value_numeric IS NOT NULL
          AND lr.value_numeric < 3.0
        ORDER BY lr.effective_at DESC
    `, [facId]);

    // Dehydration signals: BUN/Cr ratio > 20 (calculate from paired labs)
    const dehydrationRes = await query<{
        simpl_id: string;
        bun_value: number;
        creat_value: number;
        bun_date: string;
    }>(`
        SELECT b.simpl_id, b.value_numeric AS bun_value, c.value_numeric AS creat_value,
               b.effective_at::text AS bun_date
        FROM lab_results b
        JOIN lab_results c ON c.simpl_id = b.simpl_id
            AND c.observation_name = 'CREAT'
            AND c.value_numeric IS NOT NULL AND c.value_numeric > 0
            AND ABS(EXTRACT(EPOCH FROM (b.effective_at - c.effective_at))) < 86400
        JOIN patients p ON p.simpl_id = b.simpl_id
        WHERE p.fac_id = $1
          AND b.observation_name = 'BUN'
          AND b.value_numeric IS NOT NULL
          AND (b.value_numeric / NULLIF(c.value_numeric, 0)) > 20
        ORDER BY b.effective_at DESC
    `, [facId]);

    return {
        transfusionOpportunities: {
            totalEvents: transfusionRes.rows.length,
            uniquePatients: new Set(transfusionRes.rows.map(r => r.simpl_id)).size,
            avgHgb: transfusionRes.rows.length > 0
                ? Math.round(transfusionRes.rows.reduce((s, r) => s + r.value_numeric, 0) / transfusionRes.rows.length * 10) / 10
                : null,
            severeCases: transfusionRes.rows.filter(r => r.value_numeric < 7.0).length,
        },
        infusionOpportunities: {
            totalEvents: infusionRes.rows.length,
            uniquePatients: new Set(infusionRes.rows.map(r => r.simpl_id)).size,
            avgAlbumin: infusionRes.rows.length > 0
                ? Math.round(infusionRes.rows.reduce((s, r) => s + r.value_numeric, 0) / infusionRes.rows.length * 10) / 10
                : null,
            severeCases: infusionRes.rows.filter(r => r.value_numeric < 2.5).length,
        },
        dehydrationSignals: {
            totalEvents: dehydrationRes.rows.length,
            uniquePatients: new Set(dehydrationRes.rows.map(r => r.simpl_id)).size,
            severeCases: dehydrationRes.rows.filter(r => (r.bun_value / r.creat_value) > 30).length,
        },
    };
}

/** 3. Wound care analysis */
async function getWoundCareAnalysis(facId: number) {
    const woundConditions = WOUND_CODES_PREFIX.map(c => `c.icd10_code LIKE '${c}%'`).join(' OR ');

    const woundRes = await query<{
        simpl_id: string;
        icd10_code: string;
        icd10_description: string;
        clinical_status: string;
        onset_date: string;
    }>(`
        SELECT c.simpl_id, c.icd10_code, c.icd10_description, c.clinical_status, c.onset_date::text
        FROM conditions c
        JOIN patients p ON p.simpl_id = c.simpl_id
        WHERE p.fac_id = $1
          AND (${woundConditions})
          AND c.clinical_status = 'Active'
    `, [facId]);

    // Cross-reference: patients with wounds who were transferred to hospital
    const woundPatientIds = [...new Set(woundRes.rows.map(r => r.simpl_id))];

    let woundTransfers = 0;
    if (woundPatientIds.length > 0) {
        const woundTransferRes = await query<{ cnt: number }>(`
            SELECT COUNT(DISTINCT a.simpl_id)::int AS cnt
            FROM adt_records a
            WHERE a.simpl_id = ANY($1)
              AND a.is_cancelled = FALSE
              AND (a.destination_type ILIKE '%acute%' OR a.destination_type ILIKE '%hospital%'
                   OR a.destination ILIKE '%hospital%')
        `, [woundPatientIds]);
        woundTransfers = woundTransferRes.rows[0]?.cnt ?? 0;
    }

    // Wound types breakdown
    const woundTypes: Record<string, number> = {};
    for (const r of woundRes.rows) {
        const desc = r.icd10_description || r.icd10_code;
        woundTypes[desc] = (woundTypes[desc] || 0) + 1;
    }

    return {
        totalWoundConditions: woundRes.rows.length,
        uniqueWoundPatients: woundPatientIds.length,
        woundPatientsTransferred: woundTransfers,
        woundTypes: Object.entries(woundTypes)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => ({ type, count })),
    };
}

/** 4. Facility overview */
async function getFacilityOverview(facId: number) {
    const res = await query<{
        name: string;
        total_patients: number;
        active_patients: number;
        avg_age: number;
        avg_conditions: number;
        avg_medications: number;
    }>(`
        SELECT
            f.name,
            COUNT(p.simpl_id)::int AS total_patients,
            COUNT(p.simpl_id) FILTER (WHERE p.patient_status = 'Current' OR p.patient_status IS NULL)::int AS active_patients,
            ROUND(AVG(EXTRACT(YEAR FROM AGE(NOW(), p.date_of_birth::date))))::int AS avg_age,
            ROUND(AVG(cond_cnt))::int AS avg_conditions,
            ROUND(AVG(med_cnt))::int AS avg_medications
        FROM patients p
        LEFT JOIN facilities f ON f.fac_id = p.fac_id
        LEFT JOIN LATERAL (SELECT COUNT(*)::int AS cond_cnt FROM conditions c WHERE c.simpl_id = p.simpl_id AND c.clinical_status = 'Active') cc ON TRUE
        LEFT JOIN LATERAL (SELECT COUNT(*)::int AS med_cnt FROM medications m WHERE m.simpl_id = p.simpl_id AND m.status = 'Active') mc ON TRUE
        WHERE p.fac_id = $1
        GROUP BY f.name
    `, [facId]);

    return res.rows[0] ?? null;
}

/** 5. Existing analysis results summary */
async function getAnalysisSummary(facId: number) {
    const res = await query<{
        analysis_type: string;
        severity: string;
        cnt: number;
    }>(`
        SELECT ar.analysis_type, ar.severity, COUNT(*)::int AS cnt
        FROM analysis_results ar
        JOIN patients p ON p.simpl_id = ar.simpl_id
        WHERE p.fac_id = $1 AND ar.is_current = TRUE
        GROUP BY ar.analysis_type, ar.severity
        ORDER BY ar.analysis_type, ar.severity
    `, [facId]);

    const summary: Record<string, Record<string, number>> = {};
    for (const r of res.rows) {
        if (!summary[r.analysis_type]) summary[r.analysis_type] = {};
        summary[r.analysis_type][r.severity] = r.cnt;
    }
    return summary;
}

// ─── Main handler ──────────────────────────────────────────────────────────

export async function GET() {
    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
    }

    try {
        const facilityData: Record<number, {
            facId: number;
            alias: string;
            isVellum: boolean;
            overview: Awaited<ReturnType<typeof getFacilityOverview>>;
            transfers: Awaited<ReturnType<typeof getTransferAnalysis>>;
            labs: Awaited<ReturnType<typeof getLabAnalysis>>;
            woundCare: Awaited<ReturnType<typeof getWoundCareAnalysis>>;
            analysisSummary: Awaited<ReturnType<typeof getAnalysisSummary>>;
        }> = {};

        // Run all facility analyses in parallel
        await Promise.all(ALL_FACILITIES.map(async (facId) => {
            const [overview, transfers, labs, woundCare, analysisSummary] = await Promise.all([
                getFacilityOverview(facId),
                getTransferAnalysis(facId),
                getLabAnalysis(facId),
                getWoundCareAnalysis(facId),
                getAnalysisSummary(facId),
            ]);

            facilityData[facId] = {
                facId,
                alias: FACILITY_ALIASES[facId] ?? `Facility ${facId}`,
                isVellum: VELLUM_FACILITIES.includes(facId),
                overview,
                transfers,
                labs,
                woundCare,
                analysisSummary,
            };
        }));

        // Compute comparative summaries
        const vellumFacs = VELLUM_FACILITIES.map(id => facilityData[id]).filter(Boolean);
        const nonVellumFacs = NON_VELLUM_FACILITIES.map(id => facilityData[id]).filter(Boolean);

        const sumTransfers = (facs: typeof vellumFacs) =>
            facs.reduce((s, f) => s + f.transfers.acuteHospitalTransfers, 0);
        const sumPatients = (facs: typeof vellumFacs) =>
            facs.reduce((s, f) => s + (f.overview?.active_patients ?? 0), 0);
        const sumDaysOut = (facs: typeof vellumFacs) =>
            facs.reduce((s, f) => s + f.transfers.totalDaysOut, 0);
        const allDaysOut = (facs: typeof vellumFacs) =>
            facs.flatMap(f => f.transfers.daysOutDistribution);

        const vellumDays = allDaysOut(vellumFacs);
        const nonVellumDays = allDaysOut(nonVellumFacs);

        const comparative = {
            vellum: {
                totalPatients: sumPatients(vellumFacs),
                totalTransfers: sumTransfers(vellumFacs),
                transferRate: sumPatients(vellumFacs) > 0
                    ? Math.round(sumTransfers(vellumFacs) / sumPatients(vellumFacs) * 1000) / 10
                    : 0,
                totalDaysOut: sumDaysOut(vellumFacs),
                avgDaysOut: vellumDays.length > 0
                    ? Math.round(vellumDays.reduce((a, b) => a + b, 0) / vellumDays.length * 10) / 10
                    : null,
                totalTransfusionOpps: vellumFacs.reduce((s, f) => s + f.labs.transfusionOpportunities.totalEvents, 0),
                totalInfusionOpps: vellumFacs.reduce((s, f) => s + f.labs.infusionOpportunities.totalEvents, 0),
                totalDehydrationSignals: vellumFacs.reduce((s, f) => s + f.labs.dehydrationSignals.totalEvents, 0),
                totalWoundPatients: vellumFacs.reduce((s, f) => s + f.woundCare.uniqueWoundPatients, 0),
                woundPatientsTransferred: vellumFacs.reduce((s, f) => s + f.woundCare.woundPatientsTransferred, 0),
            },
            nonVellum: {
                totalPatients: sumPatients(nonVellumFacs),
                totalTransfers: sumTransfers(nonVellumFacs),
                transferRate: sumPatients(nonVellumFacs) > 0
                    ? Math.round(sumTransfers(nonVellumFacs) / sumPatients(nonVellumFacs) * 1000) / 10
                    : 0,
                totalDaysOut: sumDaysOut(nonVellumFacs),
                avgDaysOut: nonVellumDays.length > 0
                    ? Math.round(nonVellumDays.reduce((a, b) => a + b, 0) / nonVellumDays.length * 10) / 10
                    : null,
                totalTransfusionOpps: nonVellumFacs.reduce((s, f) => s + f.labs.transfusionOpportunities.totalEvents, 0),
                totalInfusionOpps: nonVellumFacs.reduce((s, f) => s + f.labs.infusionOpportunities.totalEvents, 0),
                totalDehydrationSignals: nonVellumFacs.reduce((s, f) => s + f.labs.dehydrationSignals.totalEvents, 0),
                totalWoundPatients: nonVellumFacs.reduce((s, f) => s + f.woundCare.uniqueWoundPatients, 0),
                woundPatientsTransferred: nonVellumFacs.reduce((s, f) => s + f.woundCare.woundPatientsTransferred, 0),
            },
        };

        // Financial impact estimates
        const BED_REVENUE_PER_DAY = 480;
        const AVG_HOSPITAL_TRANSFER_COST = 10000;

        const financialImpact = {
            nonVellum: {
                lostBedRevenue: sumDaysOut(nonVellumFacs) * BED_REVENUE_PER_DAY,
                estimatedHospitalCosts: sumTransfers(nonVellumFacs) * AVG_HOSPITAL_TRANSFER_COST,
                avoidableTransfers: Math.round(sumTransfers(nonVellumFacs) * 0.4), // 40% avoidable benchmark
                avoidableCostSavings: Math.round(sumTransfers(nonVellumFacs) * 0.4) * AVG_HOSPITAL_TRANSFER_COST,
            },
            vellum: {
                lostBedRevenue: sumDaysOut(vellumFacs) * BED_REVENUE_PER_DAY,
                estimatedHospitalCosts: sumTransfers(vellumFacs) * AVG_HOSPITAL_TRANSFER_COST,
            },
        };

        return NextResponse.json({
            generatedAt: new Date().toISOString(),
            facilities: facilityData,
            comparative,
            financialImpact,
            config: {
                vellumFacIds: VELLUM_FACILITIES,
                nonVellumFacIds: NON_VELLUM_FACILITIES,
                bedRevenuePerDay: BED_REVENUE_PER_DAY,
                avgHospitalTransferCost: AVG_HOSPITAL_TRANSFER_COST,
            },
        });
    } catch (error) {
        console.error('[/api/case-study/data] Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
