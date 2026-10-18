import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { fcmConfigured } from '@/lib/fcm';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
const isToken = (t: unknown): t is string => typeof t === 'string' && /^[\w:.-]{20,4096}$/.test(t);

/**
 * The Android app's Firebase token for this phone (passed in when the app opens the site; see
 * src/lib/push-client.ts). One phone = one token; if someone else signs in on it, it moves to them.
 */
export async function POST(req: NextRequest) {
  const session = await requireApproved();
  if (!session) return unauthorized();
  const b = await req.json().catch(() => null);
  if (!isToken(b?.token)) return NextResponse.json({ error: 'invalid token' }, { status: 400, headers: NO_STORE });

  const { error } = await createAdminClient()
    .from('native_push_tokens')
    .upsert(
      {
        user_id: session.user.id,
        token: b.token,
        platform: 'android',
        app_version: Number.isInteger(b.appVersion) ? b.appVersion : null,
        notifications_enabled: b.enabled !== false,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  // native: false = Firebase isn't set up in Vercel yet, so the phone should keep its Web Push.
  return NextResponse.json({ ok: true, native: fcmConfigured() }, { headers: NO_STORE });
}

/** Signing out on this phone: stop sending it this person's notifications. */
export async function DELETE(req: NextRequest) {
  const session = await requireApproved();
  if (!session) return unauthorized();
  const b = await req.json().catch(() => null);
  if (!isToken(b?.token)) return NextResponse.json({ error: 'token required' }, { status: 400, headers: NO_STORE });
  await createAdminClient().from('native_push_tokens').delete().eq('user_id', session.user.id).eq('token', b.token);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
