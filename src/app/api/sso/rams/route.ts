import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { canAccess, SSO_PATH } from '@/lib/portals';
import { emailProven, RAMS_ORIGIN, ramsLink, ramsSsoConfigured, safeRamsPath } from '@/lib/sso';

export const dynamic = 'force-dynamic';

/**
 * /api/sso/rams?next=/operatives?team=heliaxis — opens RAMS already signed in (src/lib/sso.ts).
 * For anyone with RAMS (or Our team) access here who has confirmed their email once; everyone
 * else goes to RAMS's own sign-in as before.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeRamsPath(url.searchParams.get('next'));
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

  // A link prefetch must never mint a sign-in token.
  const h = req.headers;
  if (h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) {
    return new NextResponse(null, { status: 204, headers });
  }

  const { user, profile } = await getSessionProfile();
  const allowed = !!user && profile?.status === 'approved' && (canAccess(profile, 'rams') || canAccess(profile, 'team'));
  if (!allowed || !ramsSsoConfigured()) return NextResponse.redirect(`${RAMS_ORIGIN}${next}`, { status: 303, headers });

  // Sign-ups here don't confirm email addresses: prove it once before we vouch for it to RAMS.
  if (!(await emailProven(user))) {
    return NextResponse.redirect(new URL(`${SSO_PATH}?${new URLSearchParams({ next })}`, url), { status: 303, headers });
  }
  return NextResponse.redirect(await ramsLink(user.email, next), { status: 303, headers });
}
