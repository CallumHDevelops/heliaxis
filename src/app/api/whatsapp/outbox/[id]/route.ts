import { createAdminClient } from '@/lib/supabase/admin';
import { cancelQueued, editScheduled, sendQueuedNow } from '@/lib/whatsapp/outbox-actions';
import { chatSession, isUuid, json, mayOpenChat } from '@/lib/whatsapp/routes';
import { mayChangeQueued, parseSendAt, sendLaterReady } from '@/lib/whatsapp/send-later';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * A queued reply: { action: 'edit', body } | { action: 'send-now' } | { action: 'cancel' }. CRM staff
 * too, for a customer with a job (as the chat it's in). A message someone scheduled (Send later) can
 * only be changed by them or an admin, and its edit can move it too: { action: 'edit', body?, sendAt? }.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const body = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: item } = await db
    .from('whatsapp_outbox')
    .select((await sendLaterReady()) ? 'enquiry_id, kind, sent_by' : 'enquiry_id, kind')
    .eq('id', id)
    .maybeSingle<{ enquiry_id: string; kind: string; sent_by?: string | null }>();
  if (!item || (s.scope !== 'all' && !(await mayOpenChat(s, item.enquiry_id)))) return json({ error: 'Not found' }, 404);
  if (!mayChangeQueued(item, { id: s.user.id, role: s.profile.role })) {
    const { data: who } = await db.from('profiles').select('full_name, email').eq('id', item.sent_by!).maybeSingle();
    return json({ error: `Only ${who?.full_name || who?.email || 'whoever wrote it'} or an admin can change this message.` }, 403);
  }

  if (body.action === 'cancel') {
    await cancelQueued(id);
    return json({ ok: true });
  }
  if (body.action === 'edit' && item.kind === 'scheduled') {
    let at: Date | null = null;
    if (body.sendAt) {
      const p = parseSendAt(body.sendAt);
      if ('error' in p) return json({ error: p.error }, 400);
      at = p.at;
    }
    const r = await editScheduled(id, { text: typeof body.body === 'string' ? body.body : null, at });
    return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
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
