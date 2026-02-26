import { PccApiResponse } from './types';
import { getBypassHeaders } from '@/lib/api/pcc-token';

const CONSUMER_SERVICE_URL = process.env.CONSUMER_SERVICE_URL;

export async function fetchResource<T>(
    simplId: string,
    resource: string,
    token: string
): Promise<T[] | null> {
    if (!CONSUMER_SERVICE_URL) return null;

    try {
        const res = await fetch(
            `${CONSUMER_SERVICE_URL}/api/v1/pcc/${simplId}/data/${resource}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...getBypassHeaders(),
                },
                cache: 'no-store',
            }
        );

        if (!res.ok) {
            console.warn(`[sync] ${resource} for ${simplId}: HTTP ${res.status}`);
            return null;
        }

        const data: PccApiResponse<Record<string, T[]>> = await res.json();
        const body = data.body;
        if (!body) return null;

        // body is { RESOURCE_NAME: [...] }
        const records = body[resource] ?? (Object.values(body)[0] as T[]);
        return Array.isArray(records) ? records : null;
    } catch (err) {
        console.error(`[sync] Failed to fetch ${resource} for ${simplId}:`, err);
        return null;
    }
}

export async function fetchSummary(
    simplId: string,
    token: string
): Promise<Record<string, number> | null> {
    if (!CONSUMER_SERVICE_URL) return null;

    try {
        const res = await fetch(
            `${CONSUMER_SERVICE_URL}/api/v1/pcc/${simplId}/summary`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...getBypassHeaders(),
                },
                cache: 'no-store',
            }
        );

        if (!res.ok) return null;

        const data = await res.json();
        return data?.body?.resource_values ?? null;
    } catch {
        return null;
    }
}
