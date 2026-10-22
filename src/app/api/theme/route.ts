import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parsePref, THEME_AT_COOKIE, THEME_COOKIE, themeCookieOptions } from '@/lib/theme/shared';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Light / Dark / Match phone, chosen on this device (src/lib/theme/client.ts setTheme). Sets the theme
 * cookies from the server too (Safari keeps a cookie set by a page script for 7 days at most), and for
 * signed-in staff saves it to their account so their other devices follow. The account copy needs
 * supabase/theme.sql; until that has run it quietly stays on the device ("saved": "device").
 */
export async function POST(req: NextRequest) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 415, headers: NO_STORE });
  }
  const body = (await req.json().catch(() => null)) as { theme?: unknown; at?: unknown } | null;
  const theme = parsePref(body?.theme);
  if (!theme) return NextResponse.json({ error: 'theme must be light, dark or system.' }, { status: 400, headers: NO_STORE });
  // When it was chosen on the device (ms); not in the future, not before 2026.
  const now = Date.now();
  const sent = Number(body?.at);
  const at = Number.isFinite(sent) && sent > 1767225600000 && sent <= now + 60_000 ? Math.round(sent) : now;
  // A newer choice was made on this device after this one was sent (another tab, say): leave it be.
  if (Number(req.cookies.get(THEME_AT_COOKIE)?.value) > at) {
    return NextResponse.json({ ok: true, theme, saved: 'newer-kept' }, { headers: NO_STORE });
  }

  let saved: 'account' | 'device' = 'device';
  try {
    const session = await requireApproved();
    if (session) {
      const { error } = await createAdminClient()
        .from('profiles')
        .update({ theme, theme_at: new Date(at).toISOString() })
        .eq('id', session.user.id);
      // No theme column before theme.sql has run (PGRST204 / 42703): the device keeps it.
      if (!error) saved = 'account';
    }
  } catch {
    /* not signed in, or Supabase isn't set up: the cookie is enough */
  }

  const res = NextResponse.json({ ok: true, theme, saved }, { headers: NO_STORE });
  const opts = themeCookieOptions(req.nextUrl.protocol === 'https:');
  res.cookies.set(THEME_COOKIE, theme, opts);
  res.cookies.set(THEME_AT_COOKIE, String(at), opts);
  return res;
}
