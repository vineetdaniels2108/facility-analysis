import { NextResponse } from 'next/server';
import { getPccToken } from '@/lib/api/pcc-token';

export async function POST() {
    const token = await getPccToken();

    if (!token) {
        return NextResponse.json(
            { error: 'Failed to authenticate with PCC service' },
            { status: 502 }
        );
    }

    return NextResponse.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
    });
}
