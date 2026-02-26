import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db/client';
import { syncPatient, syncFacility, PatientSyncInput } from '@/lib/sync/worker';
import { runAnalysis, runAnalysisForFacility } from '@/lib/analysis/engine';

// POST /api/sync
// Body: { mode: 'patient', simplId: string } |
//       { mode: 'facility', patients: PatientSyncInput[], facId?: number } |
//       { mode: 'analysis', simplId?: string, facId?: number }
export async function POST(req: NextRequest) {
    if (!isDbConfigured()) {
        return NextResponse.json(
            { error: 'DATABASE_URL not configured — sync unavailable until AWS RDS is connected' },
            { status: 503 }
        );
    }

    // Basic auth check — require a sync secret header
    const syncSecret = process.env.SYNC_SECRET;
    if (syncSecret) {
        const authHeader = req.headers.get('x-sync-secret');
        if (authHeader !== syncSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const mode = body.mode as string;

    if (mode === 'patient') {
        const simplId = body.simplId as string;
        if (!simplId) return NextResponse.json({ error: 'simplId required' }, { status: 400 });

        const report = await syncPatient({
            simplId,
            firstName: body.firstName as string | undefined,
            lastName: body.lastName as string | undefined,
            facId: body.facId as number | undefined,
        });

        return NextResponse.json({ ok: true, report });
    }

    if (mode === 'facility') {
        const patients = body.patients as PatientSyncInput[];
        if (!Array.isArray(patients) || patients.length === 0) {
            return NextResponse.json({ error: 'patients array required' }, { status: 400 });
        }

        const concurrency = (body.concurrency as number) ?? 5;
        const { reports, totalMs } = await syncFacility(patients, { concurrency });

        const summary = {
            total: reports.length,
            success: reports.filter(r => r.status === 'success').length,
            partial: reports.filter(r => r.status === 'partial').length,
            error: reports.filter(r => r.status === 'error').length,
            totalSynced: reports.reduce((s, r) => s + r.totalSynced, 0),
            totalErrors: reports.reduce((s, r) => s + r.totalErrors, 0),
            durationMs: totalMs,
        };

        return NextResponse.json({ ok: true, summary, reports });
    }

    if (mode === 'analysis') {
        const simplId = body.simplId as string | undefined;
        const facId = body.facId as number | undefined;

        if (simplId) {
            const results = await runAnalysis(simplId);
            return NextResponse.json({ ok: true, simplId, results });
        }

        if (facId) {
            const stats = await runAnalysisForFacility(facId);
            return NextResponse.json({ ok: true, facId, stats });
        }

        return NextResponse.json({ error: 'simplId or facId required for analysis mode' }, { status: 400 });
    }

    return NextResponse.json(
        { error: `Unknown mode: ${mode}. Use 'patient', 'facility', or 'analysis'` },
        { status: 400 }
    );
}

// GET /api/sync — health check
export async function GET() {
    return NextResponse.json({
        ok: true,
        dbConfigured: isDbConfigured(),
        modes: ['patient', 'facility', 'analysis'],
        usage: {
            patient: 'POST { mode: "patient", simplId, firstName?, lastName?, facId? }',
            facility: 'POST { mode: "facility", patients: [{simplId, firstName, lastName, facId}], concurrency? }',
            analysis: 'POST { mode: "analysis", simplId? | facId? }',
        },
    });
}
