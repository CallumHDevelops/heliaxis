import { NextResponse } from 'next/server';
import { mailSession } from '@/lib/mail/server';
import { tidyFolderPath } from '@/lib/mail/shared';

export const dynamic = 'force-dynamic';

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f-]{36}$/i;

/** Email › Folders: who goes where. Suggested ones first, then the busiest. */
export async function GET() {
  const s = await mailSession();
  if (!s.ok) return json({ error: s.error }, s.status);
  if (!s.box) return json({ rows: [] });
  const { data } = await s.db
    .from('mail_rules')
    .select('id, kind, match, label, folder, action, status, source, named, never_marketing, enquiry_id, organisation_id, messages, last_at')
    .eq('box_id', s.box.id)
    .order('messages', { ascending: false })
    .limit(1000);
  return json({ rows: data ?? [] });
}

/**
 * Change one rule {id, label?, folder?, status?, action?}, or approve every suggestion at once {approveAll: true}.
 * A rule you change is yours: the job never renames it again.
 */
export async function PATCH(req: Request) {
  const s = await mailSession();
  if (!s.ok) return json({ error: s.error }, s.status);
  if (!s.box) return json({ error: 'Connect your mailbox first.' }, 400);
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  if (b.approveAll === true) {
    const { error, count } = await s.db.from('mail_rules').update({ status: 'on', updated_at: now }, { count: 'exact' }).eq('box_id', s.box.id).eq('status', 'suggested').eq('named', true);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, count: count ?? 0 });
  }
  if (!UUID.test(String(b.id || ''))) return json({ error: 'Not found' }, 404);
  const patch: Record<string, unknown> = { updated_at: now };
  if (typeof b.label === 'string' && b.label.trim()) patch.label = b.label.trim().slice(0, 80);
  if (typeof b.folder === 'string') {
    const f = tidyFolderPath(b.folder);
    if (!f) return json({ error: 'Give it a folder name.' }, 400);
    patch.folder = f;
  }
  if (['suggested', 'on', 'off'].includes(b.status)) patch.status = b.status;
  if (['file', 'marketing', 'leave'].includes(b.action)) patch.action = b.action;
  if (patch.label || patch.folder || patch.action) {
    patch.named = true;
    patch.source = 'you';
  }
  const { error } = await s.db.from('mail_rules').update(patch).eq('id', b.id).eq('box_id', s.box.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
