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

    try {
        const res = await fetch(`${AUTH_SERVICE_URL}/api/v1/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...getBypassHeaders(),
            },
            body: JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET }),
            cache: 'no-store',
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error(`[pcc-token] Auth failed ${res.status}: ${body.slice(0, 200)}`);
            return null;
        }

        const data = await res.json();
        const tokenBody = data.body ?? data;
        cachedToken = tokenBody.access_token ?? tokenBody.token ?? null;
        const expiresIn = tokenBody.expires_in ?? 3600;
        tokenExpiresAt = now + expiresIn * 1000;

        console.log('[pcc-token] Auth succeeded');
        return cachedToken;
    } catch (err) {
        console.error('[pcc-token] Network error:', err);
        return null;
    }
}
