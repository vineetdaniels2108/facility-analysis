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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const facilityFilter = searchParams.get('facility')?.trim().toLowerCase();

        const patientsDir = path.join(process.cwd(), 'public', 'mockData', 'patients');

        if (!fs.existsSync(patientsDir)) {
            return NextResponse.json({ error: 'Patients data directory not found' }, { status: 404 });
        }

        const entries = fs.readdirSync(patientsDir, { withFileTypes: true });
        const patients: PatientSummary[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const summaryPath = path.join(patientsDir, entry.name, 'summary.json');
            if (!fs.existsSync(summaryPath)) continue;

            try {
                const summary: PatientSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

                if (facilityFilter && summary.facility?.trim().toLowerCase() !== facilityFilter) {
                    continue;
                }

                patients.push(summary);
            } catch {
                // ignore malformed summary files
            }
        }

        patients.sort((a, b) => a.last_name.localeCompare(b.last_name));

        return NextResponse.json({ patients });
    } catch (error) {
        console.error('[/api/patients] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
