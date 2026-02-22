/**
 * Client for the Simpl AI Python Microservice
 */

const AI_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://127.0.0.1:8000';

export async function submitPDPMAnalysis(patientData: any) {
    try {
        const response = await fetch(`${AI_SERVICE_URL}/api/analyze/pdpm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(patientData)
        });

        if (!response.ok) {
            throw new Error(`PDPM Analysis Failed: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error calling PDPM Python Service:", error);
        throw error;
    }
}

export async function submitInfusionAnalysis(patientData: any) {
    try {
        const response = await fetch(`${AI_SERVICE_URL}/api/analyze/infusion`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(patientData)
        });

        if (!response.ok) {
            throw new Error(`Infusion Analysis Failed: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error calling Infusion Python Service:", error);
        throw error;
    }
}

export async function submitUrgentCareGapsAnalysis(payload: any) {
    try {
        const response = await fetch(`${AI_SERVICE_URL}/api/analyze/critical-labs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Care Gaps Analysis Failed: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error calling Care Gaps Python Service:", error);
        throw error;
    }
}
