import { activeChatFor, activeChats } from '@/lib/whatsapp/active';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { chatSession, isUuid, json } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

/**
 * The WhatsApp dock's list: one row per number that's been busy in the last 14 days, unread first.
 * Polls send ?v=<last version> and get { same: true } when nothing has changed. ?enquiry={id} gives
 * one customer's row ({ row }), active or not. Read-only: nothing is sent or marked read from here.
 * CRM staff without Enquiries see only customers with a job.
 */
export async function GET(req: Request) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const canInbox = s.scope === 'all';
  const configured = whatsappConfigured();

  const enquiry = url.searchParams.get('enquiry');
  if (enquiry !== null) {
    const row = isUuid(enquiry) ? await activeChatFor(s.scope, enquiry, canInbox) : null;
    return json({ row, configured, canInbox });
  }

  const limit = Math.min(100, Math.max(1, Math.round(Number(url.searchParams.get('limit')) || 40)));
  const r = await activeChats(s.scope, { limit, canInbox, known: url.searchParams.get('v') });
  return 'same' in r ? json(r) : json({ ...r, configured, canInbox });
}
