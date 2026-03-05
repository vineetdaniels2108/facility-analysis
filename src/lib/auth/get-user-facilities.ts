import { createClient } from '@/lib/supabase/server';

export interface AuthUserProfile {
    id: string;
    email: string;
    role: string;
    facilityIds: number[];
    isSuperAdmin: boolean;
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

        const role = (profile as any)?.role ?? 'user';
        const isSuperAdmin = role === 'superadmin';

        const result = {
            id: user.id,
            email: user.email ?? '',
            role,
            facilityIds: isSuperAdmin ? [] : ((profile as any)?.facility_ids ?? []),
            isSuperAdmin,
        };
        console.log('[getUserProfile] result:', result.email, 'role:', result.role, 'facilities:', result.facilityIds);
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
    // Superadmin sees everything — no filter
    if (userProfile.isSuperAdmin) return null;
    // Non-empty facility list = filter to those facilities only
    if (userProfile.facilityIds.length > 0) return userProfile.facilityIds;
    // Empty list and not superadmin = no facilities (shouldn't happen in practice)
    return null;
}
