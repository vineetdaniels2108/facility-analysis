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

    if (AUTH_SERVICE_URL && PCC_API_KEY && PCC_API_SECRET) {
        const authUrl = `${AUTH_SERVICE_URL}/api/v1/auth/token`;
        try {
            const res = await fetch(authUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...bypassHeaders },
                body: JSON.stringify({ client_id: PCC_API_KEY, client_secret: PCC_API_SECRET }),
                signal: AbortSignal.timeout(10000),
            });
            const body = await res.text();
            const isHtml = body.includes('<!DOCTYPE') || body.includes('Just a moment');
            diag.auth = {
                url: authUrl,
                status: res.status,
                ok: res.ok,
                isCloudflareBlock: isHtml,
                hasToken: body.includes('access_token'),
                body: isHtml ? 'CF_BLOCK' : body.slice(0, 200),
            };
        } catch (err) {
            diag.auth = { url: authUrl, error: err instanceof Error ? err.message : String(err) };
        }
    }

    // Test consumer service with a sample patient
    if (CONSUMER_SERVICE_URL) {
        const { getPccToken } = await import('@/lib/api/pcc-token');
        const token = await getPccToken();
        diag.consumer = {
            tokenObtained: !!token,
            url: CONSUMER_SERVICE_URL,
        };
        if (token) {
            try {
                const sampleId = '4dfce815-3bf0-4d06-815a-0140d603b5c9';
                const res = await fetch(`${CONSUMER_SERVICE_URL}/api/v1/pcc/${sampleId}/summary`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...bypassHeaders },
                    signal: AbortSignal.timeout(10000),
                });
                const body = await res.text();
                diag.consumer = {
                    ...diag.consumer as object,
                    samplePatient: sampleId,
                    status: res.status,
                    ok: res.ok,
                    body: body.slice(0, 300),
                };
            } catch (err) {
                diag.consumer = { ...diag.consumer as object, error: err instanceof Error ? err.message : String(err) };
            }
        }
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
