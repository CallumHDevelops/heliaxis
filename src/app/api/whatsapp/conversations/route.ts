import { after } from 'next/server';
import { customerRefs } from '@/lib/enquiries-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { processOutbox } from '@/lib/whatsapp/inbox';
import { json, session, version } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

const IN_INBOX = 'wa_last_message_at.not.is.null,whatsapp_opt_in.eq.true';

/**
 * What the list shows, in a few small reads: how many chats, the newest activity, unread counts and
 * what's queued. The inbox polls with ?v=<last one>, so most polls skip the full list.
 */
async function listVersion(db: ReturnType<typeof createAdminClient>) {
  const [{ data: newest, count }, { data: unread }, { data: pending }] = await Promise.all([
    db
      .from('enquiries')
      .select('id, wa_last_message_at, created_at', { count: 'exact' })
      .or(IN_INBOX)
      .order('wa_last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1),
    db.from('enquiries').select('id, wa_unread').gt('wa_unread', 0).order('id').limit(500),
    db.from('whatsapp_outbox').select('enquiry_id, kind').eq('status', 'pending').order('enquiry_id').order('kind').limit(1000),
  ]);
  return version([count, newest, unread, pending]);
}

/** The inbox list: every lead with WhatsApp activity, or opted in and waiting for a first message. */
export async function GET(req: Request) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const db = createAdminClient();
  const v = listVersion(db);
  // Someone has the app open — a good moment to send anything due.
  after(() => processOutbox().catch(() => {}));
  const known = new URL(req.url).searchParams.get('v');
  if (known && known === (await v)) return json({ same: true, v: known });

  const { data, error } = await db
    .from('enquiries')
    .select('id, name, phone, source, status, whatsapp_opt_in, wa_last_inbound_at, wa_last_message_at, wa_unread, created_at')
    .or(IN_INBOX)
    .order('wa_last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return json({ error: error.message, items: [] }, 500);

  const ids = (data ?? []).map((d) => d.id);
  // HX-0042 beside each name (customer-refs.sql); none until it's been run.
  const refs = customerRefs(ids);
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

  const refBy = await refs;

  return json({
    v: await v,
    configured: whatsappConfigured(),
    items: (data ?? []).map((d) => ({
      ...d,
      customer_ref: refBy.get(d.id) ?? null,
      last: lastBy.get(d.id) ?? null,
      queued: !!pendingBy.get(d.id)?.has('reply') || !!pendingBy.get(d.id)?.has('intro'),
      chasing: !!pendingBy.get(d.id)?.has('chase'),
    })),
  });
}
