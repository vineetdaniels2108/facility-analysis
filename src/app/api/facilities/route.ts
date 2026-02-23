import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface PatientSummary {
    simpl_id: string;
    first_name: string;
    last_name: string;
    facility: string;
    resources: string[];
}

function isValidFacilityName(name: string): boolean {
    if (!name || name.length < 10) return false;
    if (/^[\s\d\|]/.test(name)) return false;        // starts with space, digit, or pipe
    if (name.includes('|')) return false;              // lab report fragments
    if (name.includes('(512)')) return false;          // phone numbers
    if (/^\s*[A-Z]{2,5}\s*$/.test(name)) return false; // all-caps abbreviations (TX, MAC, etc.)
    if (/^\d/.test(name.trim())) return false;         // starts with a number
    if (!name.trim().includes(' ')) return false;      // single-word values (lab names, drugs)
    return true;
}

export async function GET() {
    try {
        const patientsDir = path.join(process.cwd(), 'public', 'mockData', 'patients');

        if (!fs.existsSync(patientsDir)) {
            return NextResponse.json({ facilities: [] });
        }

        const entries = fs.readdirSync(patientsDir, { withFileTypes: true });
        const facilityMap = new Map<string, { count: number; simpl_ids: string[] }>();

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const summaryPath = path.join(patientsDir, entry.name, 'summary.json');
            if (!fs.existsSync(summaryPath)) continue;

            try {
                const summary: PatientSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
                const facilityName = summary.facility?.trim();
                if (!isValidFacilityName(facilityName)) continue;

                if (!facilityMap.has(facilityName)) {
                    facilityMap.set(facilityName, { count: 0, simpl_ids: [] });
                }
                const entry2 = facilityMap.get(facilityName)!;
                entry2.count += 1;
                entry2.simpl_ids.push(summary.simpl_id);
            } catch {
                // ignore malformed summary files
            }
        }

        const facilities = Array.from(facilityMap.entries())
            .map(([name, data]) => ({ name, patient_count: data.count }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ facilities });
    } catch (error) {
        console.error('[/api/facilities] Error:', error);
        return NextResponse.json({ error: 'Failed to load facilities' }, { status: 500 });
    }
}
