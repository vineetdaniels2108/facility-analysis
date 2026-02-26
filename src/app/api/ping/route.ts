import { getBypassHeaders } from '@/lib/api/pcc-token';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;
const CONSUMER_SERVICE_URL = process.env.CONSUMER_SERVICE_URL;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const PCC_API_KEY = process.env.PCC_API_KEY;
const PCC_API_SECRET = process.env.PCC_API_SECRET;
const CF_BYPASS_TOKEN = process.env.CLOUDFLARE_BYPASS_TOKEN;

export async function GET() {
    const bypassHeaders = getBypassHeaders();
    const diag: Record<string, unknown> = {
        ok: true,
        ts: Date.now(),
        env: {
            AUTH_SERVICE_URL: AUTH_SERVICE_URL ? `${AUTH_SERVICE_URL.slice(0, 30)}...` : 'MISSING',
            CONSUMER_SERVICE_URL: CONSUMER_SERVICE_URL ? `${CONSUMER_SERVICE_URL.slice(0, 30)}...` : 'MISSING',
            AI_SERVICE_URL: AI_SERVICE_URL ? `${AI_SERVICE_URL.slice(0, 40)}...` : 'MISSING',
            PCC_API_KEY: PCC_API_KEY ? `${PCC_API_KEY.slice(0, 6)}...` : 'MISSING',
            PCC_API_SECRET: PCC_API_SECRET ? `${PCC_API_SECRET.slice(0, 6)}...` : 'MISSING',
            CF_BYPASS_TOKEN: CF_BYPASS_TOKEN ? `${CF_BYPASS_TOKEN.slice(0, 8)}...` : 'MISSING',
        },
        bypassHeadersSent: Object.keys(bypassHeaders),
    };

    // Try multiple auth body formats to find the right one
    if (AUTH_SERVICE_URL && PCC_API_KEY && PCC_API_SECRET) {
        const authUrl = `${AUTH_SERVICE_URL}/api/v1/auth/token`;
        const bodyFormats: Record<string, unknown> = {
            'key_secret': { key: PCC_API_KEY, secret: PCC_API_SECRET },
            'username_password': { username: PCC_API_KEY, password: PCC_API_SECRET },
            'apiKey_apiSecret': { apiKey: PCC_API_KEY, apiSecret: PCC_API_SECRET },
            'client_id_client_secret': { client_id: PCC_API_KEY, client_secret: PCC_API_SECRET, grant_type: 'client_credentials' },
            'clientId_clientSecret': { clientId: PCC_API_KEY, clientSecret: PCC_API_SECRET },
        };

        const basicToken = Buffer.from(`${PCC_API_KEY}:${PCC_API_SECRET}`).toString('base64');

        const authResults: Record<string, unknown> = {};
        for (const [label, bodyObj] of Object.entries(bodyFormats)) {
            try {
                const res = await fetch(authUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        ...bypassHeaders,
                    },
                    body: JSON.stringify(bodyObj),
                    signal: AbortSignal.timeout(8000),
                });
                const body = await res.text();
                const isHtml = body.includes('<!DOCTYPE') || body.includes('Just a moment');
                authResults[label] = {
                    status: res.status,
                    body: isHtml ? 'CF_BLOCK' : body.slice(0, 200),
                };
                if (res.ok) break;
            } catch (err) {
                authResults[label] = { error: err instanceof Error ? err.message : String(err) };
            }
        }

        // Also try Basic Auth header
        try {
            const res = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${basicToken}`,
                    ...bypassHeaders,
                },
                body: '{}',
                signal: AbortSignal.timeout(8000),
            });
            const body = await res.text();
            const isHtml = body.includes('<!DOCTYPE') || body.includes('Just a moment');
            authResults['basic_auth_header'] = {
                status: res.status,
                body: isHtml ? 'CF_BLOCK' : body.slice(0, 200),
            };
        } catch (err) {
            authResults['basic_auth_header'] = { error: err instanceof Error ? err.message : String(err) };
        }

        diag.auth = { url: authUrl, attempts: authResults };
    }

    // Test Railway backend
    try {
        const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
        diag.aiBackend = { url: `${AI_SERVICE_URL}/health`, status: res.status, body: await res.text() };
    } catch (err) {
        diag.aiBackend = { url: `${AI_SERVICE_URL}/health`, error: err instanceof Error ? err.message : String(err) };
    }

    return Response.json(diag, { headers: { 'Cache-Control': 'no-store' } });
}
