import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ simplId: string }> }
) {
    const { simplId } = await params;

    if (!simplId) {
        return NextResponse.json({ error: 'simplId is required' }, { status: 400 });
    }

    try {
        const filePath = path.join(process.cwd(), 'public', 'mockData', 'patients', simplId, 'summary.json');

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: 'Patient summary not found' }, { status: 404 });
        }

        const data = fs.readFileSync(filePath, 'utf-8');
        return NextResponse.json(JSON.parse(data));

    } catch (error) {
        console.error(`Error in /api/v1/pcc/${simplId}/summary:`, error);
        return NextResponse.json(
            { error: 'Internal server error while fetching patient summary' },
            { status: 500 }
        );
    }
}
