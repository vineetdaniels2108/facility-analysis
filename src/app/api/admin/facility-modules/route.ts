import { NextRequest, NextResponse } from 'next/server';
import { isDbConfigured, query } from '@/lib/db/client';
import { ALL_MODULES } from '@/lib/analysis/engine';

export const dynamic = 'force-dynamic';

const ALL_MODULE_KEYS = Object.keys(ALL_MODULES);

export async function GET(req: NextRequest) {
    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
    }

    const facId = req.nextUrl.searchParams.get('facId');

    if (facId) {
        const res = await query<{ enabled_modules: string[] }>(
            `SELECT c.enabled_modules FROM clients c
             WHERE $1 = ANY(c.fac_ids) AND c.is_active = TRUE
             LIMIT 1`,
            [parseInt(facId)]
        );
        return NextResponse.json({
            facId: parseInt(facId),
            enabledModules: res.rows[0]?.enabled_modules ?? ALL_MODULE_KEYS,
            availableModules: ALL_MODULE_KEYS.map(k => ({
                key: k,
                name: ALL_MODULES[k]?.name ?? k,
            })),
        });
    }

    const res = await query<{ client_key: string; name: string; fac_ids: number[]; enabled_modules: string[] }>(
        `SELECT client_key, name, fac_ids, enabled_modules FROM clients WHERE is_active = TRUE ORDER BY name`
    );

    return NextResponse.json({
        clients: res.rows,
        availableModules: ALL_MODULE_KEYS.map(k => ({
            key: k,
            name: ALL_MODULES[k]?.name ?? k,
        })),
    });
}

export async function PUT(req: NextRequest) {
    if (!isDbConfigured()) {
        return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
    }

    const body = await req.json();
    const { facId, enabledModules } = body as { facId: number; enabledModules: string[] };

    if (!facId || !Array.isArray(enabledModules)) {
        return NextResponse.json({ error: 'facId and enabledModules[] required' }, { status: 400 });
    }

    const valid = enabledModules.filter(m => ALL_MODULE_KEYS.includes(m));

    const existing = await query<{ id: number }>(
        `SELECT id FROM clients WHERE $1 = ANY(fac_ids) AND is_active = TRUE LIMIT 1`,
        [facId]
    );

    if (existing.rows.length > 0) {
        await query(
            `UPDATE clients SET enabled_modules = $1 WHERE id = $2`,
            [valid, existing.rows[0].id]
        );
    } else {
        const facName = await query<{ name: string }>(
            `SELECT name FROM facilities WHERE fac_id = $1`, [facId]
        );
        await query(
            `INSERT INTO clients (client_key, name, fac_ids, enabled_modules)
             VALUES ($1, $2, ARRAY[$3], $4)`,
            [
                `facility_${facId}`,
                facName.rows[0]?.name ?? `Facility ${facId}`,
                facId,
                valid,
            ]
        );
    }

    return NextResponse.json({ ok: true, facId, enabledModules: valid });
}
