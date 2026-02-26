import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const INDEX_PATH = path.join(process.cwd(), 'public', 'mockData', 'patients', '_facility_index.json');

let cachedIndex: Record<string, unknown[]> | null = null;
let cachedAt = 0;
let fileModifiedAt: string | null = null;
const CACHE_TTL = 60_000;

function loadIndex(): Record<string, unknown[]> {
    const now = Date.now();
    if (cachedIndex && now - cachedAt < CACHE_TTL) return cachedIndex;
    try {
        const stat = fs.statSync(INDEX_PATH);
        fileModifiedAt = stat.mtime.toISOString();
        cachedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
        cachedAt = now;
        return cachedIndex!;
    } catch {
        return {};
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const facilityFilter = searchParams.get('facility')?.trim();

        const index = loadIndex();

        const lastRefreshed = fileModifiedAt ?? new Date().toISOString();

        if (facilityFilter) {
            const key = Object.keys(index).find(k => k.trim().toLowerCase() === facilityFilter.toLowerCase());
            const patients = key ? index[key] : [];
            return NextResponse.json({ patients, lastRefreshed });
        }

        const patients = Object.values(index).flat();
        return NextResponse.json({ patients, lastRefreshed });
    } catch (error) {
        console.error('[/api/patients] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
