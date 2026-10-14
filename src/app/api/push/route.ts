import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

/** Save this device's push subscription for the signed-in user. */
export async function POST(req: NextRequest) {
  const session = await requireApproved();
  if (!session) return unauthorized();

  const sub = await req.json().catch(() => null);
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint.startsWith('https://') || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400, headers: NO_STORE });
  }

  // One device = one endpoint; if someone else signs in on it, it moves to them.
  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .upsert(
      {
        user_id: session.user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
      { onConflict: 'endpoint' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Turn notifications off for this device. */
export async function DELETE(req: NextRequest) {
  const session = await requireApproved();
  if (!session) return unauthorized();
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== 'string') {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400, headers: NO_STORE });
  }
  await createAdminClient()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', session.user.id)
    .eq('endpoint', body.endpoint);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
