import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { processOutbox } from './inbox';

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

/** Make a queued reply due now. False when it has already been sent or cancelled. */
export async function markSendNow(id: string) {
  const { data } = await createAdminClient()
    .from('whatsapp_outbox')
    .update({ status: 'pending', send_after: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending', 'failed'])
    .select('id');
  return !!data?.length;
}

/** Send a queued reply straight away. Null when it has already been sent or cancelled. */
export async function sendQueuedNow(id: string) {
  return (await markSendNow(id)) ? processOutbox() : null;
}
