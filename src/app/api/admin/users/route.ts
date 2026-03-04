import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type UserStatus = 'invited' | 'registered' | 'active' | 'disabled';

function deriveStatus(authUser: { email_confirmed_at?: string | null; last_sign_in_at?: string | null; banned_until?: string | null }): UserStatus {
    if (authUser.banned_until) return 'disabled';
    if (!authUser.email_confirmed_at) return 'invited';
    if (!authUser.last_sign_in_at) return 'registered';
    return 'active';
}

export async function GET() {
    try {
        const supabase = getSupabaseAdmin();

        const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
        if (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: 500 });
        }

        const { data: profileRows } = await supabase
            .from('users')
            .select('id, email, first_name, last_name, role, facility_ids, created_at');

        const profileMap = new Map(
            (profileRows ?? []).map(p => [p.id, p])
        );

        const users = authUsers.users.map(au => {
            const profile = profileMap.get(au.id);
            return {
                id: au.id,
                email: au.email,
                firstName: profile?.first_name ?? au.user_metadata?.first_name ?? '',
                lastName: profile?.last_name ?? au.user_metadata?.last_name ?? '',
                role: profile?.role ?? 'user',
                facilityIds: profile?.facility_ids ?? [],
                status: deriveStatus({
                    email_confirmed_at: au.email_confirmed_at,
                    last_sign_in_at: au.last_sign_in_at,
                    banned_until: au.banned_until,
                }),
                createdAt: au.created_at,
                lastSignIn: au.last_sign_in_at,
            };
        });

        return NextResponse.json({ users });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = getSupabaseAdmin();
        const body = await req.json();
        const { email, firstName, lastName, role, facilityIds, password } = body as {
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            facilityIds: number[];
            password?: string;
        };

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
            email,
            password: password || undefined,
            email_confirm: !!password,
            user_metadata: { first_name: firstName, last_name: lastName },
        });

        if (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: 400 });
        }

        if (authUser?.user) {
            await supabase.from('users').upsert({
                id: authUser.user.id,
                email,
                first_name: firstName || null,
                last_name: lastName || null,
                role: role || 'user',
                facility_ids: facilityIds ?? [],
            });

            if (!password) {
                await supabase.auth.admin.inviteUserByEmail(email);
            }
        }

        return NextResponse.json({
            ok: true,
            user: {
                id: authUser?.user?.id,
                email,
                firstName,
                lastName,
                role,
                facilityIds,
                status: password ? 'active' : 'invited',
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
