import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { RAMS_ORIGIN, ramsLink, safeRamsPath } from '@/lib/sso';

export const dynamic = 'force-dynamic';

/**
 * /api/sso/rams?next=/operatives?team=heliaxis — opens RAMS already signed in (src/lib/sso.ts).
 * For anyone with RAMS (or Our team) access here; everyone else goes to RAMS's sign-in as before.
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
  // The verified sign-in email, never the editable profile field.
  const to = allowed ? await ramsLink(user?.email, next) : `${RAMS_ORIGIN}${next}`;
  return NextResponse.redirect(to, { status: 303, headers });
}
