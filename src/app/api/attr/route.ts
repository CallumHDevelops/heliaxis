import { NextResponse, type NextRequest } from 'next/server';
import { ATTR_COOKIE, attrCookieOptions, attributionFromUrl, CONSENT_COOKIE, hasConsent } from '@/lib/attribution';

export const dynamic = 'force-dynamic';

/**
 * The cookie banner, after the visitor's choice:
 *  - POST { url, referrer } on Accept: remembers which ad or campaign brought them (hx_attr) from the
 *    page they landed on, parsed exactly as the middleware does. Only with hx_consent=yes.
 *  - DELETE on Reject: forgets it (hx_attr is httpOnly, so the page can't remove it itself).
 * Both only from our own pages.
 */

const noStore = { 'Cache-Control': 'no-store' };

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === req.headers.get('host');
    } catch {
      return false;
    }
  }
  return req.headers.get('sec-fetch-site') === 'same-origin';
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req) || !(req.headers.get('content-type') || '').includes('application/json')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  if (!hasConsent(req.cookies.get(CONSENT_COOKIE)?.value)) {
    return NextResponse.json({ ok: false, error: 'No cookie consent' }, { status: 400, headers: noStore });
  }
  const body = (await req.json().catch(() => null)) as { url?: unknown; referrer?: unknown } | null;
  let landing: URL | null = null;
  try {
    landing = typeof body?.url === 'string' ? new URL(body.url.slice(0, 2000)) : null;
  } catch {
    landing = null;
  }
  // Our own pages only; the referrer is accepted but not used yet.
  if (!landing || !/^https?:$/.test(landing.protocol) || landing.host !== req.headers.get('host')) {
    return NextResponse.json({ ok: true, saved: false }, { headers: noStore });
  }
  const attr = attributionFromUrl(landing);
  const res = NextResponse.json({ ok: true, saved: !!attr }, { headers: noStore });
  if (attr) res.cookies.set(ATTR_COOKIE, encodeURIComponent(JSON.stringify(attr)), attrCookieOptions());
  return res;
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(ATTR_COOKIE, '', { ...attrCookieOptions(), maxAge: 0 });
  return res;
}
