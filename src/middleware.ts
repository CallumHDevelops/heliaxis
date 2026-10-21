import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { canAccess, HUB_PATH, portalForPath } from '@/lib/portals';
import { ATTR_COOKIE, attrCookieOptions, attributionFromUrl, CONSENT_COOKIE, hasConsent } from '@/lib/attribution';
import { encodeThemeRoute, themeRouteFor } from '@/lib/theme/routes';
import { profileThemeToAdopt, THEME_AT_COOKIE, THEME_COOKIE, themeCookieOptions, THEME_ROUTE_HEADER } from '@/lib/theme/shared';

const AUTH_PATHS = ['/login', '/register', '/pending'];

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // Light / dark: tells the root layout whether this page follows the person's choice, and its status
  // bar colours (src/lib/theme/routes.ts). Set on the request in place, so every
  // NextResponse.next({ request }) below passes it on (and a value sent by the browser never is).
  request.headers.set(THEME_ROUTE_HEADER, encodeThemeRoute(themeRouteFor(pathname)));

  // --- Subcontractor portal subdomain (subcontractor.heliaxis.co.uk) ---
  // Serves only the token-gated /portal app; anything else lands on the portal home.
  const isPortalDomain =
    hostname.startsWith('subcontractor.heliaxis.co.uk') || hostname.startsWith('subcontractor.localhost');
  if (isPortalDomain) {
    if (pathname === '/portal' || pathname.startsWith('/portal/')) return NextResponse.next({ request });
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
      return NextResponse.rewrite(url, { request });
    }
    return NextResponse.next({ request });
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

  // Anything outside admin/auth is public — let it through, remembering which ad/campaign
  // brought the visitor so their enquiry is labelled (see src/lib/attribution.ts). Only once they've
  // accepted cookies: before that, the banner sends their landing page to /api/attr if they accept.
  if (!isAdminPath && !isAuthPath) {
    const res = NextResponse.next({ request });
    const consented = hasConsent(request.cookies.get(CONSENT_COOKIE)?.value);
    const attr = consented ? attributionFromUrl(request.nextUrl) : null;
    if (attr) res.cookies.set(ATTR_COOKIE, encodeURIComponent(JSON.stringify(attr)), attrCookieOptions());
    // An hx_attr set before the cookie banner existed (or without Accept) goes.
    else if (!consented && request.cookies.has(ATTR_COOKIE)) res.cookies.set(ATTR_COOKIE, '', { ...attrCookieOptions(), maxAge: 0 });
    return res;
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
    return NextResponse.next({ request });
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

    // Light / dark: the account's choice (profiles.theme, once supabase/theme.sql has run) comes to
    // this device when it is newer than the device's own, so a change on the phone follows to the
    // laptop. Put on the request too, so this very page renders with it.
    const adopt = profileThemeToAdopt(profile, {
      pref: request.cookies.get(THEME_COOKIE)?.value,
      at: request.cookies.get(THEME_AT_COOKIE)?.value,
    });
    if (adopt) {
      request.cookies.set(THEME_COOKIE, adopt.pref);
      request.cookies.set(THEME_AT_COOKIE, String(adopt.at));
      const res = NextResponse.next({ request });
      for (const c of response.cookies.getAll()) res.cookies.set(c);
      const opts = themeCookieOptions(request.nextUrl.protocol === 'https:');
      res.cookies.set(THEME_COOKIE, adopt.pref, opts);
      res.cookies.set(THEME_AT_COOKIE, String(adopt.at), opts);
      return res;
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
