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
const CF_BYPASS_TOKEN = process.env.CLOUDFLARE_BYPASS_TOKEN;

export function getBypassHeaders(): Record<string, string> {
    if (!CF_BYPASS_TOKEN) return {};
    return {
        'x-cf-bypass-token': CF_BYPASS_TOKEN,
        'CF-Access-Client-Id': CF_BYPASS_TOKEN,
        'x-bypass-token': CF_BYPASS_TOKEN,
    };
}

export async function getPccToken(): Promise<string | null> {
    const now = Date.now();

    if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
        return cachedToken;
    }

    if (!AUTH_SERVICE_URL || !API_KEY || !API_SECRET) {
        console.error('[pcc-token] Missing AUTH_SERVICE_URL, PCC_API_KEY, or PCC_API_SECRET');
        return null;
    }

    const authUrl = `${AUTH_SERVICE_URL}/api/v1/auth/token`;
    const bypass = getBypassHeaders();

    const attempts: Array<{ label: string; init: RequestInit }> = [
        {
            label: 'json:key/secret',
            init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...bypass },
                body: JSON.stringify({ key: API_KEY, secret: API_SECRET }),
            },
        },
        {
            label: 'json:username/password',
            init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...bypass },
                body: JSON.stringify({ username: API_KEY, password: API_SECRET }),
            },
        },
        {
            label: 'form:username/password',
            init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...bypass },
                body: `username=${encodeURIComponent(API_KEY)}&password=${encodeURIComponent(API_SECRET)}`,
            },
        },
        {
            label: 'form:grant_type+client',
            init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...bypass },
                body: `grant_type=client_credentials&client_id=${encodeURIComponent(API_KEY)}&client_secret=${encodeURIComponent(API_SECRET)}`,
            },
        },
        {
            label: 'basic-auth-header',
            init: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`,
                    ...bypass,
                },
                body: '{}',
            },
        },
    ];

    for (const { label, init } of attempts) {
        try {
            const res = await fetch(authUrl, { ...init, cache: 'no-store' });

            if (res.ok) {
                const data = await res.json();
                cachedToken = data.access_token ?? data.token ?? null;
                const expiresIn = data.expires_in ?? 3600;
                tokenExpiresAt = now + expiresIn * 1000;
                console.log(`[pcc-token] Auth succeeded with format: ${label}`);
                return cachedToken;
            }

            const body = await res.text().catch(() => '');
            console.warn(`[pcc-token] ${label} → ${res.status}: ${body.slice(0, 120)}`);
        } catch (err) {
            console.warn(`[pcc-token] ${label} → error: ${err instanceof Error ? err.message : err}`);
        }
    }

    console.error('[pcc-token] All auth formats failed');
    return null;
}
