import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = getSupabaseAdmin();
        const body = await req.json();
        const { firstName, lastName, role, facilityIds } = body as {
            firstName?: string;
            lastName?: string;
            role?: string;
            facilityIds?: number[];
        };

        const updates: Record<string, unknown> = {};
        if (firstName !== undefined) updates.first_name = firstName;
        if (lastName !== undefined) updates.last_name = lastName;
        if (role !== undefined) updates.role = role;
        if (facilityIds !== undefined) updates.facility_ids = facilityIds;

        if (Object.keys(updates).length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const table = supabase.from('users') as any;
            const { error } = await table.update(updates).eq('id', id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
        }

        if (firstName !== undefined || lastName !== undefined) {
            await supabase.auth.admin.updateUserById(id, {
                user_metadata: {
                    ...(firstName !== undefined ? { first_name: firstName } : {}),
                    ...(lastName !== undefined ? { last_name: lastName } : {}),
                },
            });
        }

        return NextResponse.json({ ok: true, id, updates });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = getSupabaseAdmin();

        await supabase.from('users').delete().eq('id', id);

        const { error } = await supabase.auth.admin.deleteUser(id);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true, deleted: id });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
