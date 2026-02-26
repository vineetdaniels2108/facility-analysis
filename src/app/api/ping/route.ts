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

    // Test token fetch (uses auto-format detection from pcc-token)
    if (AUTH_SERVICE_URL && PCC_API_KEY && PCC_API_SECRET) {
        const authUrl = `${AUTH_SERVICE_URL}/api/v1/auth/token`;
        const formats = [
            { label: 'json:key/secret', ct: 'application/json', body: JSON.stringify({ key: PCC_API_KEY, secret: PCC_API_SECRET }) },
            { label: 'json:username/password', ct: 'application/json', body: JSON.stringify({ username: PCC_API_KEY, password: PCC_API_SECRET }) },
            { label: 'form:username/password', ct: 'application/x-www-form-urlencoded', body: `username=${encodeURIComponent(PCC_API_KEY!)}&password=${encodeURIComponent(PCC_API_SECRET!)}` },
            { label: 'form:client_credentials', ct: 'application/x-www-form-urlencoded', body: `grant_type=client_credentials&client_id=${encodeURIComponent(PCC_API_KEY!)}&client_secret=${encodeURIComponent(PCC_API_SECRET!)}` },
            { label: 'basic-auth', ct: 'application/json', body: '{}', auth: `Basic ${Buffer.from(`${PCC_API_KEY}:${PCC_API_SECRET}`).toString('base64')}` },
        ];

        const results: Record<string, unknown> = {};
        for (const fmt of formats) {
            try {
                const headers: Record<string, string> = { 'Content-Type': fmt.ct, Accept: 'application/json', ...bypassHeaders };
                if (fmt.auth) headers['Authorization'] = fmt.auth;
                const res = await fetch(authUrl, {
                    method: 'POST', headers, body: fmt.body,
                    signal: AbortSignal.timeout(8000),
                });
                const body = await res.text();
                const isHtml = body.includes('<!DOCTYPE') || body.includes('Just a moment');
                results[fmt.label] = { status: res.status, body: isHtml ? 'CF_BLOCK' : body.slice(0, 250) };
                if (res.ok) { results[fmt.label] = { status: res.status, body: body.slice(0, 250), SUCCESS: true }; break; }
            } catch (err) {
                results[fmt.label] = { error: err instanceof Error ? err.message : String(err) };
            }
        }
        diag.auth = { url: authUrl, results };
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
