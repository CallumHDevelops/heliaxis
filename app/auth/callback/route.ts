import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Two ways in: ?code= from our own emailed sign-in link, or ?token_hash=&type=magiclink from
// the Heliaxis admin's one-tap "Social media studio" button (it asks our Supabase for a one-time
// link for an existing account and sends the browser here). Either way the session cookies set
// via cookies() are merged into the redirect by Next.
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

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

export async function GET(request: Request) {
  // A link prefetch must never use up a one-time sign-in link.
  const h = request.headers;
  if (h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) {
    return new NextResponse(null, { status: 204, headers: HEADERS });
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  let ok = false;
  try {
    const supabase = await createClient();
    if (code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    } else if (tokenHash && (type === 'magiclink' || type === 'email')) {
      ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    }
  } catch {
    ok = false;
  }
  // Expired, already used, opened on another device, or a type we don't accept.
  if (!ok) return NextResponse.redirect(`${origin}/login?error=link`, { headers: HEADERS });
  return NextResponse.redirect(`${origin}${safeNext(searchParams.get('next'), origin)}`, { headers: HEADERS });
}
