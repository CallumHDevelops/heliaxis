import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { defaultTemplate, whatsappConfigured } from '@/lib/whatsapp/api';
import { markChatRead, processOutbox, sendManual } from '@/lib/whatsapp/inbox';
import { getSettings } from '@/lib/whatsapp/settings';
import { isUuid, json, session, version } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * One chat: the lead, its messages and any smart reply waiting to go. An open chat polls with
 * ?v=<last version>: if nothing on screen has changed (no new message, tick, queued reply or edit
 * to the lead) the answer is just { same: true } and the messages aren't read at all.
 */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const known = new URL(req.url).searchParams.get('v');
  const everything = () =>
    Promise.all([
      db
        .from('whatsapp_messages')
        .select('id, direction, kind, body, template_name, status, error, sent_by, rule_id, via, created_at')
        .eq('enquiry_id', id)
        // The newest 500 (an imported chat can be long), oldest first on screen.
        .order('created_at', { ascending: false })
        .limit(500)
        .then((r) => ({ ...r, data: r.data?.reverse() ?? null })),
      getSettings(),
    ]);
  // Nothing to compare with (first load, Refresh): read it all straight away.
  const early = known ? null : everything();
  const [{ data: enquiry }, { data: outbox }, { data: newest, count }, { data: ticked }] = await Promise.all([
    db
      .from('enquiries')
      .select('id, name, email, phone, postcode, source, status, wa_id, whatsapp_opt_in, wa_last_inbound_at, wa_unread, wa_auto_off, created_at')
      .eq('id', id)
      .maybeSingle(),
    db
      .from('whatsapp_outbox')
      .select('id, kind, chase_step, rule_id, body, template_name, send_after, status, last_error, created_at')
      .eq('enquiry_id', id)
      .in('status', ['pending', 'sending', 'failed'])
      .order('send_after'),
    db.from('whatsapp_messages').select('id', { count: 'exact' }).eq('enquiry_id', id).order('created_at', { ascending: false }).limit(1),
    // Delivery ticks and failures change older messages.
    db
      .from('whatsapp_messages')
      .select('status_at')
      .eq('enquiry_id', id)
      .not('status_at', 'is', null)
      .order('status_at', { ascending: false })
      .limit(1),
  ]);
  if (!enquiry) return json({ error: 'Not found' }, 404);

  if ((outbox ?? []).some((o) => o.status === 'pending' && new Date(o.send_after).getTime() <= Date.now())) {
    after(() => processOutbox().catch(() => {}));
  }
  const v = version([enquiry, outbox, count, newest, ticked]);
  if (known === v) return json({ same: true, v, unread: enquiry.wa_unread });

  const [{ data: messages }, settings] = await (early ?? everything());

  const senders = [...new Set((messages ?? []).map((m) => m.sent_by).filter(Boolean))] as string[];
  const ruleIds = [...new Set([...(messages ?? []), ...(outbox ?? [])].map((m) => m.rule_id).filter(Boolean))] as string[];
  const [{ data: people }, { data: rules }] = await Promise.all([
    senders.length ? db.from('profiles').select('id, full_name, email').in('id', senders) : Promise.resolve({ data: [] }),
    ruleIds.length ? db.from('whatsapp_rules').select('id, name').in('id', ruleIds) : Promise.resolve({ data: [] }),
  ]);
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || 'Team']));
  const ruleName = new Map((rules ?? []).map((r) => [r.id, r.name]));

  return json({
    v,
    configured: whatsappConfigured(),
    defaultTemplate: defaultTemplate().name || null,
    chase: { questions: settings.chaseQuestions, hours: settings.chaseAfterHours },
    enquiry,
    messages: (messages ?? []).map((m) => ({
      ...m,
      by: m.sent_by
        ? personName.get(m.sent_by) || 'Team'
        : m.via === 'whatsapp-app'
          ? 'Sent from the WhatsApp app'
          : m.via === 'chase'
            ? 'Chaser'
            : m.rule_id
              ? `Smart reply · ${ruleName.get(m.rule_id) || ''}`
              : null,
    })),
    outbox: (outbox ?? []).map((o) => ({ ...o, rule: o.rule_id ? ruleName.get(o.rule_id) || 'Smart reply' : null })),
  });
}

/** Send: { text } or { template, lang, params }, plus optional { chaseHours } if they don't reply. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const template = typeof body.template === 'string' ? body.template.trim() : '';
  if (!text && !template) return json({ error: 'Nothing to send' }, 400);
  if (text.length > 4096) return json({ error: 'WhatsApp messages are limited to 4,096 characters.' }, 400);
  const r = await sendManual(
    id,
    s.user.id,
    text
      ? { text }
      : {
          template,
          lang: String(body.lang || defaultTemplate().lang),
          params: Array.isArray(body.params) ? body.params.map((p: unknown) => String(p ?? '')) : [],
        },
    Math.min(14 * 24, Math.max(0, Number(body.chaseHours) || 0))
  );
  return r.ok ? json({ ok: true, id: r.id }) : json({ error: r.error }, 400);
}

/** { read: true } clears the unread badge (and sends blue ticks); { autoOff } toggles smart replies. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await session())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const body = await req.json().catch(() => ({}));
  const db = createAdminClient();
  if (body.read) await markChatRead(id);
  if (typeof body.autoOff === 'boolean') {
    await db.from('enquiries').update({ wa_auto_off: body.autoOff }).eq('id', id);
    if (body.autoOff) {
      await db
        .from('whatsapp_outbox')
        .update({ status: 'cancelled', last_error: 'Smart replies turned off' })
        .eq('enquiry_id', id)
        .eq('status', 'pending')
        .not('rule_id', 'is', null);
    }
  }
  return json({ ok: true });
}
