import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // API routes are server-to-server — never require browser auth
    if (pathname.startsWith('/api/')) {
        return NextResponse.next()
    }

    return await updateSession(request)
}

export const config = {
    // Exclude: static assets, images, api routes
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
