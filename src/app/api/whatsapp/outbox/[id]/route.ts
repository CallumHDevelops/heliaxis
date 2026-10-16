import { createAdminClient } from '@/lib/supabase/admin';
import { processOutbox } from '@/lib/whatsapp/inbox';
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
    await db.from('whatsapp_outbox').update({ status: 'cancelled', last_error: 'Cancelled' }).eq('id', id).in('status', ['pending', 'failed']);
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
    const { data } = await db
      .from('whatsapp_outbox')
      .update({ status: 'pending', send_after: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['pending', 'failed'])
      .select('id');
    if (!data?.length) return json({ error: 'Already sent or cancelled' }, 409);
    const r = await processOutbox();
    return json({ ok: true, ...r });
  }
  return json({ error: 'Unknown action' }, 400);
}
