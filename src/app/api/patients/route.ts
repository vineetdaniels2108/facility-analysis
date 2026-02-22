import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const patientsDir = path.join(process.cwd(), 'public', 'mockData', 'patients');

        if (!fs.existsSync(patientsDir)) {
            return NextResponse.json({ error: 'Patients data directory not found' }, { status: 404 });
        }

        // Get folders (which are simpl_ids)
        const entries = fs.readdirSync(patientsDir, { withFileTypes: true });
        const patients = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const summaryPath = path.join(patientsDir, entry.name, 'summary.json');
                if (fs.existsSync(summaryPath)) {
                    const summaryRaw = fs.readFileSync(summaryPath, 'utf-8');
                    try {
                        const summary = JSON.parse(summaryRaw);
                        patients.push(summary);
                    } catch (e) {
                        // ignore broken summary
                    }
                }
            }
        }

        return NextResponse.json({ patients });
    } catch (error) {
        console.error('Error fetching patients list:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
