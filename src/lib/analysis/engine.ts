import { query, withTransaction } from '@/lib/db/client';
import { buildPatientContext } from './context';
import { AnalysisModule, AnalysisResult } from './types';
import { infusionModule } from './modules/infusion';
import { transfusionModule } from './modules/transfusion';
import { foleyRiskModule } from './modules/foley-risk';
import { gtubeRiskModule } from './modules/gtube-risk';
import { mtnRiskModule } from './modules/mtn-risk';
import { runAIReview } from './modules/ai-reviewer';

// Registry of all available modules
const ALL_MODULES: Record<string, AnalysisModule> = {
    infusion: infusionModule,
    transfusion: transfusionModule,
    foley_risk: foleyRiskModule,
    gtube_risk: gtubeRiskModule,
    mtn_risk: mtnRiskModule,
};

// Default modules to run if no client config is found
const DEFAULT_MODULES = ['infusion', 'transfusion', 'foley_risk', 'gtube_risk', 'mtn_risk'];

async function getEnabledModules(simplId: string): Promise<string[]> {
    try {
        // Look up which modules this patient's facility has enabled
        const res = await query<{ enabled_modules: string[] }>(
            `SELECT c.enabled_modules FROM clients c
             JOIN patients p ON p.fac_id = ANY(c.fac_ids)
             WHERE p.simpl_id = $1 AND c.is_active = TRUE
             LIMIT 1`,
            [simplId]
        );
        return res.rows[0]?.enabled_modules ?? DEFAULT_MODULES;
    } catch {
        return DEFAULT_MODULES;
    }
}

export async function runAnalysis(simplId: string): Promise<AnalysisResult[]> {
    const [ctx, enabledModules] = await Promise.all([
        buildPatientContext(simplId),
        getEnabledModules(simplId),
    ]);

    if (!ctx) {
        console.warn(`[analysis] No context available for ${simplId}`);
        return [];
    }

    const results: AnalysisResult[] = [];

    for (const moduleKey of enabledModules) {
        const module = ALL_MODULES[moduleKey];
        if (!module) {
            console.warn(`[analysis] Unknown module: ${moduleKey}`);
            continue;
        }

        try {
            const result = module.analyze(ctx);
            results.push(result);
        } catch (err) {
            console.error(`[analysis] Module ${moduleKey} failed for ${simplId}:`, err);
        }
    }

    // AI review: runs only when at least one rule-based module flags medium+
    try {
        const aiResults = await runAIReview({ ctx, ruleResults: results });
        results.push(...aiResults);
    } catch (err) {
        console.error(`[analysis] AI review failed for ${simplId}:`, err);
    }

    // Persist all results (rule-based + AI) to DB
    await withTransaction(async (client) => {
        await client.query(
            `UPDATE analysis_results SET is_current = FALSE WHERE simpl_id = $1`,
            [simplId]
        );

        for (const result of results) {
            await client.query(
                `INSERT INTO analysis_results
                    (simpl_id, analysis_type, severity, score, priority, reasoning,
                     key_indicators, expires_at, is_current)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + INTERVAL '6 hours',TRUE)`,
                [
                    simplId,
                    result.analysisType,
                    result.severity,
                    result.score,
                    result.priority ?? null,
                    result.reasoning,
                    JSON.stringify(result.keyIndicators),
                ]
            );
        }
    });

    return results;
}

export async function runAnalysisForFacility(facId: number): Promise<{
    total: number;
    completed: number;
    errors: number;
}> {
    const patientsRes = await query<{ simpl_id: string }>(
        `SELECT simpl_id FROM patients WHERE fac_id = $1 AND last_synced_at IS NOT NULL`,
        [facId]
    );

    const patients = patientsRes.rows;
    let completed = 0;
    let errors = 0;

    for (const p of patients) {
        try {
            await runAnalysis(p.simpl_id);
            completed++;
        } catch (err) {
            console.error(`[analysis] Failed for ${p.simpl_id}:`, err);
            errors++;
        }
    }

    return { total: patients.length, completed, errors };
}

// Register a new module at runtime (for extensibility)
export function registerModule(module: AnalysisModule): void {
    if (ALL_MODULES[module.type]) {
        console.warn(`[analysis] Overwriting existing module: ${module.type}`);
    }
    ALL_MODULES[module.type] = module;
    console.log(`[analysis] Registered module: ${module.type} (${module.name})`);
}

export { ALL_MODULES };
