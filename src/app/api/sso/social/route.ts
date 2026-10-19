import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { canAccess, SSO_PATH } from '@/lib/portals';
import { emailProven, safeSocialPath, SOCIAL_ORIGIN, socialLink, socialSsoConfigured } from '@/lib/sso';

export const dynamic = 'force-dynamic';

/**
 * /api/sso/social?next=/studio — opens the social studio already signed in (src/lib/sso.ts).
 * For anyone with Social media studio access here who has confirmed their email once (for this
 * or RAMS) and already has a studio account under it; everyone else goes to the studio's own
 * sign-in as before.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeSocialPath(url.searchParams.get('next'));
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

  // A link prefetch must never mint a sign-in token.
  const h = req.headers;
  if (h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) {
    return new NextResponse(null, { status: 204, headers });
  }

  const { user, profile } = await getSessionProfile();
  const allowed = !!user && profile?.status === 'approved' && canAccess(profile, 'social');
  if (!allowed || !socialSsoConfigured()) return NextResponse.redirect(`${SOCIAL_ORIGIN}${next}`, { status: 303, headers });

  // Sign-ups here don't confirm email addresses: prove it once before we vouch for it to the studio.
  if (!(await emailProven(user))) {
    return NextResponse.redirect(new URL(`${SSO_PATH}?${new URLSearchParams({ app: 'social', next })}`, url), { status: 303, headers });
  }
  // A signed-in link comes with a cookie that ties it to this browser (src/lib/sso.ts).
  const { url: dest, cookie } = await socialLink(user.email, next);
  const res = NextResponse.redirect(dest, { status: 303, headers });
  if (cookie) res.cookies.set(cookie);
  return res;
}
