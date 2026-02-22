import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ simplId: string, resource: string }> }
) {
    const { simplId, resource } = await params;

    if (!simplId || !resource) {
        return NextResponse.json({ error: 'simplId and resource are required' }, { status: 400 });
    }

    try {
        const filePath = path.join(process.cwd(), 'public', 'mockData', 'patients', simplId, `${resource}.json`);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: `Resource ${resource} not found for patient ${simplId}` }, { status: 404 });
        }

        const data = fs.readFileSync(filePath, 'utf-8');
        return NextResponse.json(JSON.parse(data));

    } catch (error) {
        console.error(`Error in /api/v1/pcc/${simplId}/data/${resource}:`, error);
        return NextResponse.json(
            { error: 'Internal server error while fetching patient resource data' },
            { status: 500 }
        );
    }
}
