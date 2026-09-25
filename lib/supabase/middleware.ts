import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// /api/telegram is a machine-to-machine webhook (secured by its own secret
// token + sender allowlist), so it must not be bounced to /login
const PUBLIC_PATHS = ['/login', '/register', '/auth', '/api/telegram'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Public webhooks/callbacks don't need an auth lookup — skip Supabase entirely
  // so they never depend on it (and can never hang the middleware).
  if (isPublic && path !== '/login' && path !== '/register') {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Never let a slow/unreachable Supabase (e.g. a paused free-tier project) hang
  // the middleware — that 504s the whole site. Cap the auth lookup; on a
  // timeout/error, treat the request as signed-out (gated pages fall back to
  // /login, which still renders).
  let user: { id: string } | null = null;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 4000);
    });
    const result = (await Promise.race([supabase.auth.getUser(), timeout])) as Awaited<
      ReturnType<typeof supabase.auth.getUser>
    > | null;
    if (timer) clearTimeout(timer);
    user = result?.data?.user ?? null;
  } catch {
    user = null;
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone(); url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (user && (path === '/login' || path === '/register')) {
    const url = request.nextUrl.clone(); url.pathname = '/studio';
    return NextResponse.redirect(url);
  }
  return response;
}
