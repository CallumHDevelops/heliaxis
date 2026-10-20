import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { processOutbox, SEND_NOW_NOTE } from './inbox';

/** Cancel a queued reply (smart reply, chaser) that hasn't gone yet. False when it already went. */
export async function cancelQueued(id: string) {
  const { data } = await createAdminClient()
    .from('whatsapp_outbox')
    .update({ status: 'cancelled', last_error: 'Cancelled' })
    .eq('id', id)
    .in('status', ['pending', 'failed'])
    .select('id');
  return !!data?.length;
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
