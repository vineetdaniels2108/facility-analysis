import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { extractPatientData } from '@/lib/analysis/extractor';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://127.0.0.1:8000';
const CONSUMER_SERVICE_URL = process.env.CONSUMER_SERVICE_URL;

// ─── Fetch patient resource data (AWS with local fallback) ────────────────────

async function fetchResource(simplId: string, resource: string, token: string | null): Promise<unknown> {
    // Try AWS if we have a token
    if (CONSUMER_SERVICE_URL && token) {
        try {
            const res = await fetch(`${CONSUMER_SERVICE_URL}/api/v1/pcc/${simplId}/data/${resource}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                cache: 'no-store',
            });
            if (res.ok) return await res.json();
        } catch { /* fall through */ }
    }

    // Local JSON fallback
    const filePath = path.join(process.cwd(), 'public', 'mockData', 'patients', simplId, `${resource}.json`);
    if (fs.existsSync(filePath)) {
        try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { /* fall through */ }
    }

    return null;
}

// ─── Call Python analysis backend ─────────────────────────────────────────────

async function callPython(endpoint: string, payload: unknown): Promise<unknown> {
    const res = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Python backend ${res.status}`);
    return res.json();
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const { simplId, patient_name, facility, resources: knownResources } = await request.json();

    if (!simplId) {
        return NextResponse.json({ error: 'simplId required' }, { status: 400 });
    }

    // Determine which resources to fetch
    const resourcesToFetch: string[] = knownResources?.length
        ? knownResources
        : ['OBSERVATIONS', 'DIAGNOSTICREPORTS', 'MEDICATIONS'];

    // Fetch all resources in parallel (no auth token needed for local fallback)
    const resourceData: Record<string, unknown> = {};
    await Promise.all(
        resourcesToFetch.map(async (r) => {
            resourceData[r] = await fetchResource(simplId, r, null);
        })
    );

    // Extract structured data
    const { labs, vitals, conditions, medications } = extractPatientData(resourceData);

    const basePayload = {
        simplId,
        patient_name: patient_name ?? simplId,
        facility: facility ?? '',
        conditions,
        medications,
        labs,
        vitals,
    };

    // Build lab records list for critical-labs analyzer
    const labRecords = Object.entries(labs).map(([name, value]) => ({
        name,
        value,
        unit: getLabUnit(name),
    }));

    // Run all 3 analyses in parallel, catching individual failures
    const [pdpmResult, infusionResult, transfusionResult] = await Promise.allSettled([
        callPython('/api/analyze/pdpm', basePayload),
        callPython('/api/analyze/infusion', basePayload),
        callPython('/api/analyze/critical-labs', {
            simplId,
            patient_name: patient_name ?? simplId,
            facility: facility ?? '',
            labs: labRecords,
        }),
    ]);

    return NextResponse.json({
        simplId,
        pdpm: pdpmResult.status === 'fulfilled' ? pdpmResult.value : { error: 'unavailable' },
        infusion: infusionResult.status === 'fulfilled' ? infusionResult.value : { error: 'unavailable' },
        transfusion: transfusionResult.status === 'fulfilled' ? transfusionResult.value : { error: 'unavailable' },
        dataSource: Object.keys(labs).length > 0 ? 'live' : 'default',
        timestamp: new Date().toISOString(),
    });
}

function getLabUnit(name: string): string {
    const units: Record<string, string> = {
        Hemoglobin: 'g/dL', Hematocrit: '%', Ferritin: 'ng/mL',
        Albumin: 'g/dL', BUN: 'mg/dL', Creatinine: 'mg/dL',
        Sodium: 'mEq/L', Potassium: 'mEq/L', Chloride: 'mEq/L',
        CO2: 'mEq/L', Glucose: 'mg/dL', INR: 'ratio',
    };
    return units[name] ?? '';
}
