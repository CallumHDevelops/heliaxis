import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { processOutbox, SEND_NOW_NOTE } from './inbox';
import { freeAt, windowShutWords } from './schedule';

/**
 * Cancel a queued message (smart reply, chaser, a message someone scheduled) that hasn't gone yet.
 * Its kind ('reply', 'scheduled' …), or null when it already went.
 */
export async function cancelQueued(id: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('whatsapp_outbox')
    .update({ status: 'cancelled', last_error: 'Cancelled' })
    .eq('id', id)
    .in('status', ['pending', 'failed'])
    .select('id, kind');
  return (data?.[0]?.kind as string | undefined) ?? null;
}

/**
 * Make a queued reply due now. Noted as pressed by a person, so it goes even in quiet hours (the
 * outbox's safety net only holds what it sends on its own). False when it's been sent or cancelled.
 */
export async function markSendNow(id: string) {
  const { data } = await createAdminClient()
    .from('whatsapp_outbox')
    .update({ status: 'pending', send_after: new Date().toISOString(), last_error: SEND_NOW_NOTE })
    .eq('id', id)
    .in('status', ['pending', 'failed'])
    .select('id');
  return !!data?.length;
}

/** Send a queued reply straight away. Null when it has already been sent or cancelled. */
export async function sendQueuedNow(id: string) {
  return (await markSendNow(id)) ? processOutbox() : null;
}

/**
 * Change a message someone scheduled: its words (not a template's) and/or when it goes. A typed
 * message must still fall inside the customer's free 24h window at the new time.
 */
export async function editScheduled(id: string, change: { text?: string | null; at?: Date | null }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const db = createAdminClient();
  const { data: item } = await db.from('whatsapp_outbox').select('id, enquiry_id, template_name, send_after, status').eq('id', id).maybeSingle();
  if (!item || item.status !== 'pending') return { ok: false, status: 409, error: 'Already sent or cancelled' };
  const at = change.at ?? new Date(item.send_after);
  const update: { send_after: string; body?: string } = { send_after: at.toISOString() };
  if (typeof change.text === 'string' && !item.template_name) {
    if (!change.text.trim()) return { ok: false, status: 400, error: 'The message is empty' };
    if (change.text.length > 4096) return { ok: false, status: 400, error: 'WhatsApp messages are limited to 4,096 characters.' };
    update.body = change.text.trim();
  }
  if (!item.template_name) {
    const { data: e } = await db.from('enquiries').select('name, wa_last_inbound_at').eq('id', item.enquiry_id).maybeSingle();
    if (!freeAt(at, e?.wa_last_inbound_at)) return { ok: false, status: 409, error: windowShutWords(e?.name, e?.wa_last_inbound_at, at, new Date()) };
  }
  const { data } = await db.from('whatsapp_outbox').update(update).eq('id', id).eq('status', 'pending').select('id');
  return data?.length ? { ok: true } : { ok: false, status: 409, error: 'Already sent or cancelled' };
}
