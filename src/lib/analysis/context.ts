import { query } from '@/lib/db/client';
import { PatientContext, LabSnapshot } from './types';

function calcTrend(history: LabSnapshot[]): 'rising' | 'falling' | 'stable' {
    if (history.length < 2) return 'stable';
    const delta = history[0].value - history[1].value;
    const pct = Math.abs(delta) / Math.max(history[1].value, 0.001);
    if (pct < 0.05) return 'stable';
    return delta > 0 ? 'rising' : 'falling';
}

export async function buildPatientContext(simplId: string): Promise<PatientContext | null> {
    try {
        // 1. Latest lab values per observation name
        const labsRes = await query<{
            observation_name: string; value_numeric: string; unit: string;
            ref_low: string; ref_high: string; is_abnormal: boolean;
            is_critical: boolean; effective_at: Date;
        }>(
            `SELECT DISTINCT ON (observation_name)
                observation_name, value_numeric, unit, ref_low, ref_high,
                is_abnormal, is_critical, effective_at
             FROM lab_results
             WHERE simpl_id = $1 AND value_numeric IS NOT NULL
             ORDER BY observation_name, effective_at DESC`,
            [simplId]
        );

        // 2. Lab history (last 10 readings per lab) for trends
        const histRes = await query<{
            observation_name: string; value_numeric: string; unit: string;
            ref_low: string; ref_high: string; is_abnormal: boolean;
            is_critical: boolean; effective_at: Date;
        }>(
            `SELECT observation_name, value_numeric, unit, ref_low, ref_high,
                    is_abnormal, is_critical, effective_at
             FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY observation_name ORDER BY effective_at DESC) rn
                FROM lab_results
                WHERE simpl_id = $1 AND value_numeric IS NOT NULL
             ) ranked WHERE rn <= 10
             ORDER BY observation_name, effective_at DESC`,
            [simplId]
        );

        // 3. Active conditions
        const condRes = await query<{ icd10_code: string; icd10_description: string }>(
            `SELECT icd10_code, icd10_description FROM conditions
             WHERE simpl_id = $1 AND clinical_status = 'ACTIVE'`,
            [simplId]
        );

        // 4. Active care plan focuses
        const cpRes = await query<{ description: string }>(
            `SELECT description FROM care_plan_focuses
             WHERE simpl_id = $1 AND status = 'Active' AND description IS NOT NULL`,
            [simplId]
        );

        // 5. Active medications
        const medRes = await query<{ description: string; rxnorm_id: string; directions: string }>(
            `SELECT description, rxnorm_id, directions FROM medications
             WHERE simpl_id = $1 AND status = 'ACTIVE'`,
            [simplId]
        );

        // 6. Assessment scores
        const assRes = await query<{ description: string; score: string }>(
            `SELECT DISTINCT ON (description) description, score
             FROM assessments
             WHERE simpl_id = $1 AND score IS NOT NULL
             ORDER BY description, ref_date DESC`,
            [simplId]
        );

        // 7. Latest vitals
        const vitalRes = await query<{ type: string; value: string; systolic_value: string; diastolic_value: string; recorded_at: Date }>(
            `SELECT DISTINCT ON (type) type, value, systolic_value, diastolic_value, recorded_at
             FROM observations
             WHERE simpl_id = $1 AND is_struck_out = FALSE
             ORDER BY type, recorded_at DESC`,
            [simplId]
        );

        // Build lab history map
        const labHistoryMap: Record<string, LabSnapshot[]> = {};
        for (const row of histRes.rows) {
            if (!labHistoryMap[row.observation_name]) labHistoryMap[row.observation_name] = [];
            labHistoryMap[row.observation_name].push({
                name: row.observation_name,
                value: parseFloat(row.value_numeric),
                unit: row.unit,
                refLow: row.ref_low ? parseFloat(row.ref_low) : null,
                refHigh: row.ref_high ? parseFloat(row.ref_high) : null,
                isAbnormal: row.is_abnormal,
                isCritical: row.is_critical,
                effectiveAt: row.effective_at,
            });
        }

        // Build latest labs map with trend info
        const labs: Record<string, LabSnapshot> = {};
        for (const row of labsRes.rows) {
            const history = labHistoryMap[row.observation_name] ?? [];
            const snap: LabSnapshot = {
                name: row.observation_name,
                value: parseFloat(row.value_numeric),
                unit: row.unit,
                refLow: row.ref_low ? parseFloat(row.ref_low) : null,
                refHigh: row.ref_high ? parseFloat(row.ref_high) : null,
                isAbnormal: row.is_abnormal,
                isCritical: row.is_critical,
                effectiveAt: row.effective_at,
                trend: calcTrend(history),
                previousValue: history[1]?.value,
                previousDate: history[1]?.effectiveAt,
            };
            labs[row.observation_name] = snap;
        }

        // Build vitals map
        const vitals: PatientContext['vitals'] = {};
        for (const v of vitalRes.rows) {
            if (v.type === 'bloodPressure' && v.systolic_value) {
                vitals.bloodPressure = {
                    systolic: parseInt(v.systolic_value),
                    diastolic: parseInt(v.diastolic_value),
                    recordedAt: v.recorded_at,
                };
            } else if (v.type === 'bloodSugar' && v.value) {
                vitals.bloodSugar = { value: parseFloat(v.value), recordedAt: v.recorded_at };
            } else if (v.type === 'painLevel' && v.value) {
                vitals.painLevel = { value: parseFloat(v.value), recordedAt: v.recorded_at };
            }
        }

        return {
            simplId,
            labs,
            labHistory: labHistoryMap,
            activeIcd10Codes: condRes.rows.map(r => r.icd10_code).filter(Boolean),
            activeConditions: condRes.rows.map(r => ({ icd10: r.icd10_code, description: r.icd10_description })),
            carePlanFocuses: cpRes.rows.map(r => (r.description ?? '').toLowerCase()),
            activeMedications: medRes.rows.map(r => ({ name: r.description, rxnorm: r.rxnorm_id, directions: r.directions })),
            assessmentScores: Object.fromEntries(assRes.rows.map(r => [r.description, parseFloat(r.score)])),
            vitals,
        };
    } catch (err) {
        console.error(`[analysis/context] Failed to build context for ${simplId}:`, err);
        return null;
    }
}
