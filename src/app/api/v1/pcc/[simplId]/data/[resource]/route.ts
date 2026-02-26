import { NextResponse } from 'next/server';
import { getPccToken, getBypassHeaders } from '@/lib/api/pcc-token';
import fs from 'fs';
import path from 'path';

const CONSUMER_SERVICE_URL = process.env.CONSUMER_SERVICE_URL;

function readLocalFallback(simplId: string, resource: string): NextResponse | null {
    try {
        const filePath = path.join(process.cwd(), 'public', 'mockData', 'patients', simplId, `${resource}.json`);
        if (!fs.existsSync(filePath)) return null;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return new NextResponse(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Data-Source': 'local_cache' },
        });
    } catch {
        return null;
    }
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ simplId: string; resource: string }> }
) {
    const { simplId, resource } = await params;

    if (!simplId || !resource) {
        return NextResponse.json({ error: 'simplId and resource are required' }, { status: 400 });
    }

    // Try live AWS first
    if (CONSUMER_SERVICE_URL) {
        const token = await getPccToken();

        if (token) {
            try {
                const upstream = await fetch(
                    `${CONSUMER_SERVICE_URL}/api/v1/pcc/${simplId}/data/${resource}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/json',
                            ...getBypassHeaders(),
                        },
                        cache: 'no-store',
                    }
                );

                if (upstream.ok) {
                    const body = await upstream.text();
                    return new NextResponse(body, {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                console.warn(`[pcc/data] Upstream ${upstream.status} for ${simplId}/${resource} — falling back to local cache`);
            } catch (err) {
                console.warn(`[pcc/data] AWS unreachable for ${simplId}/${resource} — falling back to local cache:`, err);
            }
        } else {
            console.warn(`[pcc/data] Auth unavailable — falling back to local cache for ${simplId}/${resource}`);
        }
    }

    // Fall back to local JSON cache
    const local = readLocalFallback(simplId, resource);
    if (local) return local;

    return NextResponse.json(
        { error: `No data found for ${resource} — AWS is unreachable and no local cache exists for this patient.` },
        { status: 404 }
    );
}
