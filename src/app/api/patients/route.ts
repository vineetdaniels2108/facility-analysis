import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const INDEX_PATH = path.join(process.cwd(), 'public', 'mockData', 'patients', '_facility_index.json');

let cachedIndex: Record<string, unknown[]> | null = null;
let cachedAt = 0;
const CACHE_TTL = 60_000;

function loadIndex(): Record<string, unknown[]> {
    const now = Date.now();
    if (cachedIndex && now - cachedAt < CACHE_TTL) return cachedIndex;
    try {
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

        if (facilityFilter) {
            // Case-insensitive lookup
            const key = Object.keys(index).find(k => k.trim().toLowerCase() === facilityFilter.toLowerCase());
            const patients = key ? index[key] : [];
            return NextResponse.json({ patients });
        }

        // Return all patients (flattened)
        const patients = Object.values(index).flat();
        return NextResponse.json({ patients });
    } catch (error) {
        console.error('[/api/patients] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
