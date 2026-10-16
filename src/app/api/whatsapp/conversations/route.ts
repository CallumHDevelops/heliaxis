import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { processOutbox } from '@/lib/whatsapp/inbox';
import { json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

/** The inbox list: every lead with WhatsApp activity, or opted in and waiting for a first message. */
export async function GET() {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const db = createAdminClient();
  const { data, error } = await db
    .from('enquiries')
    .select('id, name, phone, source, status, whatsapp_opt_in, wa_last_inbound_at, wa_last_message_at, wa_unread, created_at')
    .or('wa_last_message_at.not.is.null,whatsapp_opt_in.eq.true')
    .order('wa_last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return json({ error: error.message, items: [] }, 500);

  const ids = (data ?? []).map((d) => d.id);
  const [{ data: last }, { data: pending }] = ids.length
    ? await Promise.all([
        db
          .from('whatsapp_messages')
          .select('enquiry_id, direction, body, created_at')
          .in('enquiry_id', ids)
          .order('created_at', { ascending: false })
          .limit(1000),
        db.from('whatsapp_outbox').select('enquiry_id, kind').in('enquiry_id', ids).eq('status', 'pending'),
      ])
    : [{ data: [] }, { data: [] }];
  const lastBy = new Map<string, { direction: string; body: string | null }>();
  for (const m of last ?? []) if (!lastBy.has(m.enquiry_id)) lastBy.set(m.enquiry_id, m);
  const pendingBy = new Map<string, Set<string>>();
  for (const p of pending ?? []) pendingBy.set(p.enquiry_id, (pendingBy.get(p.enquiry_id) ?? new Set()).add(p.kind));

  // Someone has the app open — a good moment to send anything due.
  after(() => processOutbox().catch(() => {}));
  return json({
    configured: whatsappConfigured(),
    items: (data ?? []).map((d) => ({
      ...d,
      last: lastBy.get(d.id) ?? null,
      queued: !!pendingBy.get(d.id)?.has('reply') || !!pendingBy.get(d.id)?.has('intro'),
      chasing: !!pendingBy.get(d.id)?.has('chase'),
    })),
  });
}
