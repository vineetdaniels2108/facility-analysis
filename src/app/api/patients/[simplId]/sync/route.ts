import { NextResponse } from 'next/server';
import { fetchPatientResourcesSummary, fetchPatientResourceData } from '@/lib/api/pcc';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ simplId: string }> }
) {
    const { simplId } = await params;

    if (!simplId) {
        return NextResponse.json({ error: 'simplId is required' }, { status: 400 });
    }

    try {
        // 1. Fetch available resources from the summary endpoint
        const summary = await fetchPatientResourcesSummary(simplId);

        if (!summary) {
            return NextResponse.json({ error: 'Failed to fetch patient summary or patient not found' }, { status: 404 });
        }

        // The exact structure of the summary response depends on the API, 
        // but typically it returns a list of available resources we can iterate over.
        // E.g. { resources: ['conditions', 'medications', 'observations', 'encounters'] }
        const availableResources: string[] = summary.resources || summary.available_resources || [];

        // As a fallback for development if summary structure is unknown, we can define the core ones
        const resourcesToFetch = availableResources.length > 0
            ? availableResources
            : ['conditions', 'medications', 'observations', 'encounters', 'diagnosticreports'];

        // 2. Fetch data for each available resource concurrently
        const patientData: Record<string, any> = {
            simplId,
            summary,
            data: {}
        };

        const fetchPromises = resourcesToFetch.map(async (resource) => {
            const data = await fetchPatientResourceData(simplId, resource);
            patientData.data[resource] = data;
        });

        await Promise.all(fetchPromises);

        // 3. Return the aggregated clinical data payload
        return NextResponse.json({
            success: true,
            message: 'Successfully aggregated patient data from PCC',
            patientData
        });

    } catch (error) {
        console.error(`Error in /api/patients/${simplId}/sync:`, error);
        return NextResponse.json(
            { error: 'Internal server error while syncing patient data' },
            { status: 500 }
        );
    }
}
