import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Everything is private except these. /share/* is deliberately public — the
// token in the URL is the credential, and it is validated server-side.
const PUBLIC_PREFIXES = ['/login', '/register', '/pending', '/share', '/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail closed. With no Supabase configuration there is no way to
  // authenticate anyone, so the app must not be reachable.
  if (!configured) {
    if (isPublic(pathname)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const { response, supabase, user } = await updateSession(request);

  if (isPublic(pathname)) {
    // Send an already-approved user straight to the dashboard rather than
    // showing them the sign-in screen again.
    if (user && (pathname === '/login' || pathname === '/register')) {
      const { data } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .single();
      if (data?.status === 'approved') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
    return response;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') {
    const url = request.nextUrl.clone();
    url.pathname = '/pending';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api/health|_next/static|_next/image|favicon.ico|brand/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)',
  ],
};
