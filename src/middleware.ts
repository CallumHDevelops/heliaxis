import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const AUTH_PATHS = ['/login', '/register', '/pending'];

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // --- Subcontractor subdomain routing (unchanged) ---
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

  // --- Admin auth (only when Supabase is configured) ---
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAuthPath = AUTH_PATHS.includes(pathname);

  if (!supabaseConfigured || (!isAdminPath && !isAuthPath)) {
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = '/pending';
      return NextResponse.redirect(url);
    }

    // The approvals dashboard is admin-only.
    if (pathname.startsWith('/admin/approvals') && profile.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
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
      url.pathname = '/admin';
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
