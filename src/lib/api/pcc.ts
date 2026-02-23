import { cache } from 'react';

// Environment variables to be set in Next.js config or .env.local
const AUTH_API_URL = process.env.AUTH_SERVICE_URL;
const CONSUMER_API_URL = process.env.CONSUMER_SERVICE_URL;
const API_KEY = process.env.PCC_API_KEY; // "10du779irijl6jnl90to2ojfil"
const API_SECRET = process.env.PCC_API_SECRET; // "1u7so5rhejlbd1b5goc1elrchitrre82cta8t1jqfpe6cg75ck93"

/**
 * Interface for the API Bearer Token
 */
interface AuthTokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

/**
 * Fetch a new bearer token using the key and secret
 */
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
                // Assuming basic auth with key:secret depending on provider specs, 
                // or passed in body body: JSON.stringify({ key: API_KEY, secret: API_SECRET })
                // We'll pass it in body for now, but this might need adjustment based on exact spec
            },
            body: JSON.stringify({
                key: API_KEY,
                secret: API_SECRET
            }),
            cache: 'no-store' // Don't cache the token response from Next.js natively, handle it manually if needed
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch token: ${response.statusText}`);
        }

        const data: AuthTokenResponse = await response.json();
        return data.access_token;

    } catch (error) {
        console.error("Error authenticating with external service:", error);
        return null;
    }
}

/**
 * Fetch the summary of available resources for a specific simpl_id (patient/facility id context)
 */
export const fetchPatientResourcesSummary = cache(async (simplId: string) => {
    if (!CONSUMER_API_URL) return null;

    const token = await fetchApiToken();
    if (!token) return null;

    try {
        const res = await fetch(`${CONSUMER_API_URL}/api/v1/pcc/${simplId}/summary`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            next: { revalidate: 3600 } // Cache for 1 hour
        });

        if (!res.ok) throw new Error("Failed to fetch resources summary");

        return await res.json();
    } catch (error) {
        console.error("Error fetching patient resource summary:", error);
        return null;
    }
});

/**
 * Fetch specific resource data points (e.g., conditions, vitals, labs)
 */
export async function fetchPatientResourceData(simplId: string, resource: string) {
    if (!CONSUMER_API_URL) return null;

    const token = await fetchApiToken();
    if (!token) return null;

    try {
        const res = await fetch(`${CONSUMER_API_URL}/api/v1/pcc/${simplId}/data/${resource}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            cache: 'no-store' // Real-time clinical data shouldn't be heavily cached
        });

        if (!res.ok) throw new Error(`Failed to fetch ${resource} data`);

        return await res.json();
    } catch (error) {
        console.error(`Error fetching resource ${resource}:`, error);
        return null;
    }
}
