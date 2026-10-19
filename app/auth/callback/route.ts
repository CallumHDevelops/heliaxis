import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Two ways in: ?code= from our own emailed sign-in link, or ?token_hash=&type=magiclink&state= from
// the Heliaxis admin's one-tap "Social media studio" button (it asks our Supabase for a one-time
// link for an existing account and sends the browser here). Either way the session cookies set
// via cookies() are merged into the redirect by Next.
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

// The Heliaxis button also sets this cookie (on heliaxis.co.uk, so we can read it here) to the
// same random value as the link's ?state=. So its link only works in the browser that tapped the
// button: copied out and sent to someone else, it can't swap them into another account. One use.
const STATE_COOKIE = 'hx_social_sso';
const STATE_COOKIE_OPTIONS = { domain: 'heliaxis.co.uk', path: '/auth/callback', httpOnly: true, secure: true, sameSite: 'lax' } as const;

function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** Only a path on this site: "/studio" yes; "//evil.com", "/\evil.com", "https://…" or /auth… no. */
function safeNext(next: string | null, origin: string): string {
  if (!next) return '/studio';
  try {
    // Checked as given and decoded, so an encoded "//" or "/auth" can't slip through.
    const plain = decodeURIComponent(next);
    if (![next, plain].every((s) => /^\/(?![/\\])/.test(s) && !/[\x00-\x1f\\]/.test(s))) return '/studio';
    const u = new URL(next, origin);
    const path = u.pathname.replace(/\/{2,}/g, '/');
    if (u.origin !== origin || /^\/auth(\/|$)/i.test(decodeURIComponent(path))) return '/studio';
    return `${path}${u.search}`;
  } catch {
    return '/studio';
  }
}

export async function GET(request: NextRequest) {
  // A link prefetch must never use up a one-time sign-in link.
  const h = request.headers;
  if (h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) {
    return new NextResponse(null, { status: 204, headers: HEADERS });
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const state = request.cookies.get(STATE_COOKIE)?.value ?? '';
  let ok = false;
  try {
    const supabase = await createClient();
    if (code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    } else if (tokenHash && type === 'magiclink' && sameState(searchParams.get('state') ?? '', state)) {
      ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    }
  } catch {
    ok = false;
  }
  // Expired, already used, opened on another device or browser, or a type we don't accept.
  const res = ok
    ? NextResponse.redirect(`${origin}${safeNext(searchParams.get('next'), origin)}`, { headers: HEADERS })
    : NextResponse.redirect(`${origin}/login?error=link`, { headers: HEADERS });
  if (state) res.cookies.set(STATE_COOKIE, '', { ...STATE_COOKIE_OPTIONS, expires: new Date(0) });
  return res;
}
