import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { defaultTemplate, whatsappConfigured } from '@/lib/whatsapp/api';
import { markChatRead, processOutbox, scheduleManual, sendManual, type SendInput } from '@/lib/whatsapp/inbox';
import { getSettings } from '@/lib/whatsapp/settings';
import { chaseView, lateSendAt } from '@/lib/whatsapp/schedule';
import { LATER_COLS, mayChangeQueued, parseSendAt, sendLaterReady } from '@/lib/whatsapp/send-later';
import { mediaVersion, withChatMedia } from '@/lib/whatsapp/media';
import { chatSession, json, mayOpenChat, version } from '@/lib/whatsapp/routes';
import { wordingForNote } from '@/lib/whatsapp/template-text';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
/** What's queued in the chat; the Send later columns once whatsapp-scheduled.sql has been run. */
type QueuedRow = {
  id: string;
  kind: string;
  chase_step: number;
  rule_id: string | null;
  body: string | null;
  template_name: string | null;
  send_after: string;
  status: string;
  last_error: string | null;
  created_at: string;
  sent_by?: string | null;
  template_params?: string[] | null;
  chase_hours?: number | null;
};

/**
 * One chat: the lead, its messages and any smart reply waiting to go. An open chat polls with
 * ?v=<last version>: if nothing on screen has changed (no new message, tick, queued reply or edit
 * to the lead) the answer is just { same: true } and the messages aren't read at all.
 *
 * Enquiries staff can open any chat; CRM staff only those whose number has an opportunity (404
 * otherwise, so it doesn't give away that the chat exists).
 */
export async function GET(req: Request, { params }: Ctx) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!(await mayOpenChat(s, id))) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const known = new URL(req.url).searchParams.get('v');
  // With their photos, voice notes and files once whatsapp-media.sql has been run.
  const cols = await withChatMedia('id, direction, kind, body, template_name, status, error, sent_by, rule_id, via, created_at');
  const everything = () =>
    Promise.all([
      db
        .from('whatsapp_messages')
        .select(cols)
        .eq('enquiry_id', id)
        // The newest 500 (an imported chat can be long), oldest first on screen.
        .order('created_at', { ascending: false })
        .limit(500)
        .then((r) => ({ ...r, data: r.data?.reverse() ?? null })),
      getSettings(),
    ]);
  // Nothing to compare with (first load, Refresh): read it all straight away.
  const early = known ? null : everything();
  // Send later (whatsapp-scheduled.sql): who wrote each scheduled message, and its chaser.
  const later = await sendLaterReady();
  const outboxCols: string = `id, kind, chase_step, rule_id, body, template_name, send_after, status, last_error, created_at${later ? `, ${LATER_COLS}` : ''}`;
  const [{ data: enquiry }, { data: outboxRows }, { data: newest, count }, { data: ticked }, files] = await Promise.all([
    db
      .from('enquiries')
      .select('id, name, email, phone, postcode, source, status, wa_id, whatsapp_opt_in, wa_last_inbound_at, wa_unread, wa_auto_off, created_at')
      .eq('id', id)
      .maybeSingle(),
    db
      .from('whatsapp_outbox')
      .select(outboxCols)
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
    // A photo or file arriving (or failing) changes an older message too.
    mediaVersion(db, id),
  ]);
  if (!enquiry) return json({ error: 'Not found' }, 404);
  const outbox = (outboxRows ?? []) as unknown as QueuedRow[];

  if (outbox.some((o) => o.status === 'pending' && new Date(o.send_after).getTime() <= Date.now())) {
    after(() => processOutbox().catch(() => {}));
  }
  const v = version(files ? [enquiry, outbox, count, newest, ticked, files] : [enquiry, outbox, count, newest, ticked]);
  if (known === v) return json({ same: true, v, unread: enquiry.wa_unread });

  const [{ data: messages }, settings] = await (early ?? everything());

  // Templates sent before the wording was saved: show it as the customer saw it, and save it.
  const notes = (messages ?? []).filter((m) => m.kind === 'template' && m.body?.startsWith('Template “'));
  if (notes.length) {
    const fixed = await Promise.all(notes.map(async (m) => ({ m, wording: await wordingForNote(m.body).catch(() => null) })));
    const done = fixed.filter((f): f is { m: (typeof notes)[number]; wording: string } => !!f.wording);
    for (const { m, wording } of done) m.body = wording;
    if (done.length) {
      after(() =>
        Promise.all(done.map(({ m, wording }) => db.from('whatsapp_messages').update({ body: wording }).eq('id', m.id))).then(
          () => {},
          () => {}
        )
      );
    }
  }

  const senders = [...new Set([...(messages ?? []), ...outbox].map((m) => m.sent_by).filter(Boolean))] as string[];
  const ruleIds = [...new Set([...(messages ?? []), ...outbox].map((m) => m.rule_id).filter(Boolean))] as string[];
  const [{ data: people }, { data: rules }] = await Promise.all([
    senders.length ? db.from('profiles').select('id, full_name, email').in('id', senders) : Promise.resolve({ data: [] }),
    ruleIds.length ? db.from('whatsapp_rules').select('id, name').in('id', ruleIds) : Promise.resolve({ data: [] }),
  ]);
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || 'Team']));
  const ruleName = new Map((rules ?? []).map((r) => [r.id, r.name]));

  return json({
    v,
    configured: whatsappConfigured(),
    defaultTemplate: settings.firstContactTemplate || defaultTemplate().name || null,
    // `view`: so the reply box can say when a chaser would actually go (quiet hours, the evening rule),
    // and when a message typed now goes (the late-night rule; only once Send later can hold it).
    chase: {
      questions: settings.chaseQuestions,
      hours: settings.chaseAfterHours,
      view: { ...chaseView(settings), lateRule: settings.lateRule && later },
    },
    later: { ready: later },
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
    outbox: outbox.map((o) => ({
      ...o,
      rule: o.rule_id ? ruleName.get(o.rule_id) || 'Smart reply' : null,
      // A scheduled message: whose it is, and whether this person may change it (its author or an admin).
      by: o.sent_by ? personName.get(o.sent_by) || 'Team' : null,
      canChange: mayChangeQueued(o, { id: s.user.id, role: s.profile.role }),
    })),
  });
}

/**
 * Send: { text } or { template, lang, params }, plus optional { chaseHours } if they don't reply.
 * When: { now: true } sends straight away; { sendAt } (an ISO time) schedules it (Send later). With
 * neither (Metis's drafts, a page from before Send later) the late-night rule decides. A typed message
 * scheduled past the free 24h window is refused with { windowClosesAt }, so the chat can offer another way.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!(await mayOpenChat(s, id))) return json({ error: 'Not found' }, 404);
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const template = typeof body.template === 'string' ? body.template.trim() : '';
  if (!text && !template) return json({ error: 'Nothing to send' }, 400);
  if (text.length > 4096) return json({ error: 'WhatsApp messages are limited to 4,096 characters.' }, 400);
  const input: SendInput = text
    ? { text }
    : {
        template,
        lang: String(body.lang || defaultTemplate().lang),
        params: Array.isArray(body.params) ? body.params.map((p: unknown) => String(p ?? '')) : [],
      };
  const chaseHours = Math.min(14 * 24, Math.max(0, Number(body.chaseHours) || 0));

  let at: Date | null = null;
  if (body.sendAt) {
    const p = parseSendAt(body.sendAt);
    if ('error' in p) return json({ error: p.error }, 400);
    at = p.at;
  } else if (body.now !== true && (await sendLaterReady())) {
    at = lateSendAt(new Date(), await getSettings());
  }
  if (at) {
    const r = await scheduleManual(id, s.user.id, input, at, chaseHours);
    if (r.ok) return json({ ok: true, id: r.id, scheduled: { at: r.at } });
    return r.windowClosesAt ? json({ error: r.error, windowClosesAt: r.windowClosesAt }, 409) : json({ error: r.error }, 400);
  }
  const r = await sendManual(id, s.user.id, input, chaseHours);
  return r.ok ? json({ ok: true, id: r.id }) : json({ error: r.error }, 400);
}

/**
 * { read: true } clears the unread badge (and sends blue ticks); { autoOff } toggles smart replies,
 * which are an Enquiries setting, so CRM-only staff can only mark a chat read.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!(await mayOpenChat(s, id))) return json({ error: 'Not found' }, 404);
  const body = await req.json().catch(() => ({}));
  if (s.scope === 'linked' && typeof body.autoOff === 'boolean') return json({ error: 'Only Enquiries staff can turn smart replies on or off.' }, 403);
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
