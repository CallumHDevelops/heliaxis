import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { isChatNotification } from '@/lib/notification-refs';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const ID = /^[0-9a-f-]{36}$/i;

/**
 * The signed-in user's latest notifications and unread count (header bell). Read WhatsApp chat
 * notifications are left out (noise once read). ?shown=<ids>: the ones on this device's screen;
 * `gone` says which of them have been read since (here or anywhere), so the page can close them.
 */
export async function GET(req: NextRequest) {
  const session = await requireApproved();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const admin = createAdminClient();
  const latest = (cols: string) =>
    admin.from('notifications').select(cols).eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(100);
  const shown = (req.nextUrl.searchParams.get('shown') || '').split(',').filter((id) => ID.test(id)).slice(0, 50);
  const COLS = 'id, kind, title, body, href, read_at, created_at';
  const [first, unread, stillUnread] = await Promise.all([
    latest(`${COLS}, ref`),
    admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .is('read_at', null),
    shown.length
      ? admin.from('notifications').select('id').eq('user_id', session.user.id).is('read_at', null).in('id', shown)
      : null,
  ]);
  // No ref column until notifications-ref.sql has been run.
  const list = first.error ? await latest(COLS) : first;
  type Row = { id: string; kind: string; title: string; href: string | null; read_at: string | null; ref?: string | null };
  const rows = ((list.data ?? []) as unknown as Row[]).filter((n) => !n.read_at || !isChatNotification(n)).slice(0, 30);
  const keep = new Set((stillUnread?.data ?? []).map((n) => n.id));
  return NextResponse.json(
    {
      notifications: rows,
      unread: unread.count ?? 0,
      ready: !list.error,
      gone: stillUnread && !stillUnread.error ? shown.filter((id) => !keep.has(id)) : [],
    },
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
