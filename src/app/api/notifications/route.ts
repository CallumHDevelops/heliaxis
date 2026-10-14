import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

/** The signed-in user's latest notifications and unread count (header bell). */
export async function GET() {
  const session = await requireApproved();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const admin = createAdminClient();
  const [list, unread] = await Promise.all([
    admin
      .from('notifications')
      .select('id, kind, title, body, href, read_at, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .is('read_at', null),
  ]);
  return NextResponse.json(
    { notifications: list.data ?? [], unread: unread.count ?? 0, ready: !list.error },
    { headers: NO_STORE }
  );
}

/** Mark notifications read: { ids: [...] } or { all: true }. */
export async function POST(req: NextRequest) {
  const session = await requireApproved();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const body = await req.json().catch(() => ({}));
  let q = createAdminClient()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .is('read_at', null);
  if (!body?.all) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
    if (!ids.length) return NextResponse.json({ ok: true }, { headers: NO_STORE });
    q = q.in('id', ids);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
