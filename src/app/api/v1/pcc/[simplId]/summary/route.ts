import { NextResponse } from 'next/server';
import { getPccToken } from '@/lib/api/pcc-token';
import fs from 'fs';
import path from 'path';

const CONSUMER_SERVICE_URL = process.env.CONSUMER_SERVICE_URL;

function readLocalFallback(simplId: string): NextResponse | null {
    try {
        const filePath = path.join(process.cwd(), 'public', 'mockData', 'patients', simplId, 'summary.json');
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
    { params }: { params: Promise<{ simplId: string }> }
) {
    const { simplId } = await params;

    if (!simplId) {
        return NextResponse.json({ error: 'simplId is required' }, { status: 400 });
    }

    // Try live AWS first
    if (CONSUMER_SERVICE_URL) {
        const token = await getPccToken();

        if (token) {
            try {
                const upstream = await fetch(
                    `${CONSUMER_SERVICE_URL}/api/v1/pcc/${simplId}/summary`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/json',
                        },
                        next: { revalidate: 3600 },
                    }
                );

                if (upstream.ok) {
                    const body = await upstream.text();
                    return new NextResponse(body, {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                console.warn(`[pcc/summary] Upstream ${upstream.status} for ${simplId} — falling back to local cache`);
            } catch (err) {
                console.warn(`[pcc/summary] AWS unreachable for ${simplId} — falling back to local cache:`, err);
            }
        } else {
            console.warn(`[pcc/summary] Auth unavailable — falling back to local cache for ${simplId}`);
        }
    }

    // Fall back to local JSON cache
    const local = readLocalFallback(simplId);
    if (local) return local;

    return NextResponse.json(
        { error: `Summary not found for ${simplId}` },
        { status: 404 }
    );
}
