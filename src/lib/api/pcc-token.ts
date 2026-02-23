/**
 * Server-side only. Manages the bearer token lifecycle for the PCC consumer service.
 * Uses module-level caching so a single token is reused across requests on the same
 * server instance, and a fresh one is fetched ~5 minutes before expiry.
 */

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;
const API_KEY = process.env.PCC_API_KEY;
const API_SECRET = process.env.PCC_API_SECRET;

export async function getPccToken(): Promise<string | null> {
    const now = Date.now();

    // Return cached token if still valid (5-minute safety buffer before expiry)
    if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
        return cachedToken;
    }

    if (!AUTH_SERVICE_URL || !API_KEY || !API_SECRET) {
        console.error('[pcc-token] Missing AUTH_SERVICE_URL, PCC_API_KEY, or PCC_API_SECRET');
        return null;
    }

    try {
        const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ key: API_KEY, secret: API_SECRET }),
            cache: 'no-store',
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error(`[pcc-token] Auth failed ${res.status}: ${body.slice(0, 200)}`);
            return null;
        }

        const data = await res.json();
        cachedToken = data.access_token ?? data.token ?? null;
        const expiresIn = data.expires_in ?? 3600;
        tokenExpiresAt = now + expiresIn * 1000;

        return cachedToken;
    } catch (err) {
        console.error('[pcc-token] Network error fetching token:', err);
        return null;
    }
}
