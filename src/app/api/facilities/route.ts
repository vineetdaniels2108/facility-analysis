import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const INDEX_PATH = path.join(process.cwd(), 'public', 'mockData', 'patients', '_facility_index.json');

function isValidFacilityName(name: string): boolean {
    if (!name || name.length < 5) return false;
    if (/^[\s\d\|]/.test(name)) return false;
    if (name.includes('|')) return false;
    if (name.includes('(512)')) return false;
    if (/^\s*[A-Z]{2,5}\s*$/.test(name)) return false;
    if (/^\d/.test(name.trim())) return false;
    // Single-word names are OK if they pass other filters (patient count filter handles noise)
    if (name.includes('<') || name.includes('>')) return false;
    if (name.includes(':') && /\d/.test(name)) return false;
    if (/Toxin|Phase|coli|Kidney|Disease/i.test(name)) return false;
    return true;
}

export async function GET() {
    try {
        if (!fs.existsSync(INDEX_PATH)) {
            return NextResponse.json({ facilities: [] });
        }

        const index: Record<string, unknown[]> = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));

        const facilities = Object.entries(index)
            .filter(([name, patients]) => isValidFacilityName(name) && patients.length >= 5)
            .map(([name, patients]) => ({ name, patient_count: patients.length }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ facilities });
    } catch (error) {
        console.error('[/api/facilities] Error:', error);
        return NextResponse.json({ error: 'Failed to load facilities' }, { status: 500 });
    }
}
