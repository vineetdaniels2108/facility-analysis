import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const PATIENTS_DIR = path.join(process.cwd(), 'public', 'mockData', 'patients');

function safeReadJson(filePath: string): unknown {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* skip */ }
    return {};
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ simplId: string }> }
) {
    const { simplId } = await params;

    // Validate simplId is a UUID to avoid path traversal
    if (!/^[a-f0-9-]{36}$/.test(simplId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    const latest = safeReadJson(path.join(PATIENTS_DIR, simplId, 'labs_latest.json'));
    const history = safeReadJson(path.join(PATIENTS_DIR, simplId, 'labs_history.json'));

    return NextResponse.json({ latest, history });
}
