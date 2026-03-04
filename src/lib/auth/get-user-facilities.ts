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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase.from('users') as any)
            .select('role, facility_ids')
            .eq('id', user.id)
            .single();

        return {
            id: user.id,
            email: user.email ?? '',
            role: (profile as any)?.role ?? 'user',
            facilityIds: (profile as any)?.facility_ids ?? [],
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
