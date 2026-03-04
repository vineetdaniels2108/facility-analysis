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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: profile } = await supabase
            .from('users')
            .select('role, facility_ids')
            .eq('id', user.id)
            .single();

        return {
            id: user.id,
            email: user.email ?? '',
            role: profile?.role ?? 'user',
            facilityIds: profile?.facility_ids ?? [],
        };
    } catch {
        return null;
    }
}

export function filterFacilitiesByUser(
    facilityIds: number[],
    userProfile: AuthUserProfile | null
): number[] | null {
    if (!userProfile) return null;
    if (userProfile.role === 'admin') return null; // null = no filter (see all)
    return userProfile.facilityIds;
}
