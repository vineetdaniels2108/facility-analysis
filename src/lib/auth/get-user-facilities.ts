import { createClient } from '@/lib/supabase/server';

export interface AuthUserProfile {
    id: string;
    email: string;
    role: string;
    facilityIds: number[];
}

export async function getUserProfile(): Promise<AuthUserProfile | null> {
    try {
        const supabase = await createClient();
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            console.log('[getUserProfile] auth error:', userErr.message);
            return null;
        }
        if (!user) {
            console.log('[getUserProfile] no user in session');
            return null;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile, error: profileErr } = await (supabase.from('users') as any)
            .select('role, facility_ids')
            .eq('id', user.id)
            .single();

        if (profileErr) {
            console.log('[getUserProfile] profile query error:', profileErr.message, 'for user:', user.email);
        }

        const result = {
            id: user.id,
            email: user.email ?? '',
            role: (profile as any)?.role ?? 'user',
            facilityIds: (profile as any)?.facility_ids ?? [],
        };
        console.log('[getUserProfile] result:', result.email, 'facilities:', result.facilityIds);
        return result;
    } catch (err) {
        console.error('[getUserProfile] unexpected error:', err);
        return null;
    }
}

export function filterFacilitiesByUser(
    facilityIds: number[],
    userProfile: AuthUserProfile | null
): number[] | null {
    if (!userProfile) return null;
    // If user has facility assignments, filter by them (even for admins)
    // Empty array = no filter (see all)
    if (userProfile.facilityIds.length > 0) return userProfile.facilityIds;
    return null;
}
