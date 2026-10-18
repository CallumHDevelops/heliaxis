import { createAdminClient } from '@/lib/supabase/admin';
import { cancelQueued, sendQueuedNow } from '@/lib/whatsapp/outbox-actions';
import { isUuid, json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A queued reply: { action: 'edit', body } | { action: 'send-now' } | { action: 'cancel' }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const body = await req.json().catch(() => ({}));
  const db = createAdminClient();

  if (body.action === 'cancel') {
    await cancelQueued(id);
    return json({ ok: true });
  }
  if (body.action === 'edit') {
    const text = String(body.body || '').trim();
    if (!text) return json({ error: 'Reply is empty' }, 400);
    const { data } = await db
      .from('whatsapp_outbox')
      .update({ body: text })
      .eq('id', id)
      .eq('status', 'pending')
      .is('template_name', null)
      .select('id');
    return data?.length ? json({ ok: true }) : json({ error: 'Already sent or cancelled' }, 409);
  }
  if (body.action === 'send-now') {
    const r = await sendQueuedNow(id);
    if (!r) return json({ error: 'Already sent or cancelled' }, 409);
    return json({ ok: true, ...r });
  }
  return json({ error: 'Unknown action' }, 400);
}
