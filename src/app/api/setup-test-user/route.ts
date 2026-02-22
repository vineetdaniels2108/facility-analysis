import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Requires the Service Role Key since we want to bypass RLS to create a user programatically

export async function GET(request: Request) {
    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );
        const { data: user, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: 'admin@simpl.ai',
            password: 'SimplPassword123!',
            email_confirm: true,
            user_metadata: {
                first_name: 'Super',
                last_name: 'Admin'
            }
        });

        if (authError) {
            console.error(authError);
            return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        // Now insert them into our custom public.users table as well
        if (user && user.user) {
            // Fetch a facility to attach them to
            const { data: facilities } = await supabaseAdmin.from('facilities').select('id').limit(1);
            const facilityId = facilities && facilities.length > 0 ? facilities[0].id : null;

            const { error: dbError } = await supabaseAdmin
                .from('users')
                .upsert({
                    id: user.user.id,
                    email: 'admin@simpl.ai',
                    first_name: 'Super',
                    last_name: 'Admin',
                    role: 'admin',
                    facility_id: facilityId
                });

            if (dbError) {
                console.error(dbError);
                return NextResponse.json({ error: dbError.message }, { status: 400 });
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Test user created successfully!',
            credentials: {
                email: 'admin@simpl.ai',
                password: 'SimplPassword123!'
            }
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
