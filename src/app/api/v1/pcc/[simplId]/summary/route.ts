import { NextResponse } from 'next/server';
import { getPccToken } from '@/lib/api/pcc-token';

const CONSUMER_SERVICE_URL = process.env.CONSUMER_SERVICE_URL;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ simplId: string }> }
) {
    const { simplId } = await params;

    if (!simplId) {
        return NextResponse.json({ error: 'simplId is required' }, { status: 400 });
    }

    if (!CONSUMER_SERVICE_URL) {
        return NextResponse.json({ error: 'CONSUMER_SERVICE_URL not configured' }, { status: 500 });
    }

    const token = await getPccToken();
    if (!token) {
        return NextResponse.json({ error: 'Authentication with PCC service failed' }, { status: 502 });
    }

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

        const body = await upstream.text();

        if (!upstream.ok) {
            console.error(`[pcc/summary] Upstream ${upstream.status} for ${simplId}: ${body.slice(0, 300)}`);
            return NextResponse.json(
                { error: `Consumer service returned ${upstream.status}`, detail: body.slice(0, 300) },
                { status: upstream.status }
            );
        }

        return new NextResponse(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error(`[pcc/summary] Network error for ${simplId}:`, err);
        return NextResponse.json({ error: 'Failed to reach PCC consumer service' }, { status: 500 });
    }
}
