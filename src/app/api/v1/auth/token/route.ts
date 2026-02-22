import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Mock the PointClickCare OAuth Token response
    return NextResponse.json({
        access_token: "mock_pcc_access_token_12345",
        token_type: "Bearer",
        expires_in: 3600
    });
}
