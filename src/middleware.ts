import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { canAccess, HUB_PATH, portalForPath } from '@/lib/portals';

const AUTH_PATHS = ['/login', '/register', '/pending'];

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // --- Subcontractor portal subdomain (subcontractor.heliaxis.co.uk) ---
  // Serves only the token-gated /portal app; anything else lands on the portal home.
  const isPortalDomain =
    hostname.startsWith('subcontractor.heliaxis.co.uk') || hostname.startsWith('subcontractor.localhost');
  if (isPortalDomain) {
    if (pathname === '/portal' || pathname.startsWith('/portal/')) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/portal';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // --- Legacy subcontractor form subdomain (subcontract.heliaxis.co.uk, unchanged) ---
  const isSubcontractDomain =
    hostname.includes('subcontract.heliaxis.co.uk') ||
    hostname.includes('subcontract.localhost');

  if (isSubcontractDomain) {
    if (pathname === '/subcontractor-form') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/subcontractor-form';
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  } else if (pathname === '/subcontractor-form') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('message', 'form-access-denied');
    return NextResponse.redirect(url);
  }

  // --- Admin auth ---
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAuthPath = AUTH_PATHS.includes(pathname);

  // Anything outside admin/auth is public — let it through.
  if (!isAdminPath && !isAuthPath) {
    return NextResponse.next();
  }

  // Fail closed: without Supabase there's no way to authenticate, so admin
  // must NOT be open. Send admin requests to the login screen.
  if (!supabaseConfigured) {
    if (isAdminPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const { response, supabase, user } = await updateSession(request);

  if (isAdminPath) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    // select('*') so this keeps working before the `portals` column migration has run.
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    if (!profile || profile.status !== 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = '/pending';
      return NextResponse.redirect(url);
    }

    // Per-portal access: admins see everything; members only the portals ticked
    // for them in /admin/users. No access → back to the dashboard with a notice.
    const needed = portalForPath(pathname);
    const allowed =
      needed === null ||
      (needed === 'admin' ? profile.role === 'admin' : canAccess(profile, needed));
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = HUB_PATH;
      url.search = '';
      url.searchParams.set('denied', '1');
      return NextResponse.redirect(url);
    }
  }

  // Already-signed-in approved users skip the login/register screens.
  if (isAuthPath && user && pathname !== '/pending') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .single();
    if (profile?.status === 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = HUB_PATH;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|woff|woff2|ttf|otf)$).*)',
  ],
};
