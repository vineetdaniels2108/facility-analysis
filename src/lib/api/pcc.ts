import { cache } from 'react';
import { getBypassHeaders } from './pcc-token';

const AUTH_API_URL = process.env.AUTH_SERVICE_URL;
const CONSUMER_API_URL = process.env.CONSUMER_SERVICE_URL;
const API_KEY = process.env.PCC_API_KEY;
const API_SECRET = process.env.PCC_API_SECRET;

interface AuthTokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

async function fetchApiToken(): Promise<string | null> {
    if (!AUTH_API_URL || !API_KEY || !API_SECRET) {
        console.error("Missing API Key, Secret, or Auth URL.");
        return null;
    }

    try {
        const response = await fetch(`${AUTH_API_URL}/api/v1/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getBypassHeaders(),
            },
            body: JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET }),
            cache: 'no-store',
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch token: ${response.statusText}`);
        }

        const data = await response.json();
        const tokenBody = data.body ?? data;
        return tokenBody.access_token ?? null;
    } catch (error) {
        console.error("Error authenticating with external service:", error);
        return null;
    }
}

export const fetchPatientResourcesSummary = cache(async (simplId: string) => {
    if (!CONSUMER_API_URL) return null;

    const token = await fetchApiToken();
    if (!token) return null;

    try {
        const res = await fetch(`${CONSUMER_API_URL}/api/v1/pcc/${simplId}/summary`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...getBypassHeaders(),
            },
            next: { revalidate: 3600 },
        });

        if (!res.ok) throw new Error("Failed to fetch resources summary");
        return await res.json();
    } catch (error) {
        console.error("Error fetching patient resource summary:", error);
        return null;
    }
});

export async function fetchPatientResourceData(simplId: string, resource: string) {
    if (!CONSUMER_API_URL) return null;

    const token = await fetchApiToken();
    if (!token) return null;

    try {
        const res = await fetch(`${CONSUMER_API_URL}/api/v1/pcc/${simplId}/data/${resource}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...getBypassHeaders(),
            },
            cache: 'no-store',
        });

        if (!res.ok) throw new Error(`Failed to fetch ${resource} data`);
        return await res.json();
    } catch (error) {
        console.error(`Error fetching resource ${resource}:`, error);
        return null;
    }
}
