import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearChatNotifications, clearReplyNotifications, notify, type NotificationInput } from '@/lib/notify';
import { chatHref, chatRef, chatTag, replyRef } from '@/lib/notification-refs';
import { canAccess } from '@/lib/portals';
import { defaultTemplate, markRead, sendDocument, sendTemplate, sendText, whatsappConfigured } from './api';
import {
  fillReply,
  HUMAN_TAKEOVER_MS,
  matchRule,
  pickDelaySeconds,
  SERVICE_WINDOW_MS,
  toWaId,
  windowOpen,
  type SmartRule,
} from './shared';
import { isQuiet, nextAwake, planChase } from './schedule';
import { ensureOpportunity, markContacted } from '@/lib/crm/server';
import { getSettings } from './settings';
import { autoParams } from './templates';
import { describeMessage as describe, type InboundMessage } from './describe';

/**
 * The WhatsApp inbox: inbound messages from the webhook, delivery statuses, smart replies
 * (queued in whatsapp_outbox and sent after a human-looking delay), chasers when a customer
 * goes quiet, messages typed in the WhatsApp Business app (coexistence echoes), and sending by hand.
 */

type Db = ReturnType<typeof createAdminClient>;

type EnquiryWa = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  wa_id: string | null;
  wa_last_inbound_at: string | null;
  wa_unread: number;
  wa_auto_off: boolean;
};

const ENQ_COLS = 'id, name, phone, status, wa_id, wa_last_inbound_at, wa_unread, wa_auto_off';

export const inboxHref = chatHref;

/** Everyone who can open Enquiries gets the push. */
export async function notifyEnquiryTeam(
  title: string,
  body: string,
  href: string,
  extra: Pick<NotificationInput, 'tag' | 'actions' | 'data' | 'ref'> = {}
) {
  const db = createAdminClient();
  const { data } = await db.from('profiles').select('*').eq('status', 'approved');
  await Promise.all(
    (data ?? [])
      .filter((p) => canAccess(p, 'enquiries'))
      .map((p) => notify({ userId: p.id, kind: 'whatsapp', title, body, href, ...extra }))
  );
}

/** The lead this WhatsApp number belongs to; creates one for a brand-new number. */
async function enquiryForNumber(
  db: Db,
  waId: string,
  profileName: string,
  referral: { headline?: string; source_url?: string } | null
): Promise<{ enquiry: EnquiryWa; created: boolean }> {
  const { data: byWa } = await db
    .from('enquiries')
    .select(ENQ_COLS)
    .eq('wa_id', waId)
    // Stay on the enquiry the chat is already on; otherwise their newest enquiry.
    .order('wa_last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (byWa?.[0]) return { enquiry: byWa[0] as EnquiryWa, created: false };

  // An existing lead whose phone was typed another way (07…, +44 …).
  const { data: withPhone } = await db
    .from('enquiries')
    .select(ENQ_COLS)
    .is('wa_id', null)
    .not('phone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  const match = (withPhone as EnquiryWa[] | null)?.find((e) => toWaId(e.phone) === waId);
  if (match) {
    await db.from('enquiries').update({ wa_id: waId }).eq('id', match.id);
    return { enquiry: { ...match, wa_id: waId }, created: false };
  }

  const ad = referral?.headline ? `Message: Came from WhatsApp ad "${referral.headline}"` : null;
  const { data: row, error } = await db
    .from('enquiries')
    .insert({
      name: profileName || `+${waId}`,
      email: '',
      phone: `+${waId}`,
      wa_id: waId,
      whatsapp_opt_in: true,
      interest: ad,
      source: referral ? 'whatsapp-ad' : 'whatsapp',
    })
    .select(ENQ_COLS)
    .single();
  if (error || !row) throw new Error(error?.message || 'Could not create enquiry');
  return { enquiry: row as EnquiryWa, created: true };
}

// What each kind of message says in the chat: describe.ts (pure, so it can be tested).
export type { InboundMessage };

export async function handleInboundMessage(m: InboundMessage, profileName: string) {
  const db = createAdminClient();
  const { data: dup } = await db.from('whatsapp_messages').select('id').eq('wa_message_id', m.id).maybeSingle();
  if (dup) return; // Meta retries webhooks

  const { enquiry, created } = await enquiryForNumber(db, m.from, profileName, m.referral ?? null);
  if (created) await ensureOpportunity(enquiry.id, m.referral ? 'WhatsApp ad' : 'WhatsApp');
  const { kind, body } = describe(m);
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();

  const { error } = await db.from('whatsapp_messages').insert({
    enquiry_id: enquiry.id,
    wa_message_id: m.id,
    direction: 'in',
    kind,
    body,
    status: 'received',
    created_at: at,
  });
  if (error) {
    if (error.code === '23505') return; // a parallel retry got there first
    throw new Error(error.message);
  }
  await db
    .from('enquiries')
    .update({
      wa_last_inbound_at: at,
      wa_last_message_at: at,
      wa_unread: (enquiry.wa_unread || 0) + 1,
      whatsapp_opt_in: true,
    })
    .eq('id', enquiry.id);

  // They answered — stop any follow-up sequence on their opportunities.
  await db
    .from('crm_projects')
    .update({ sequence_stopped_at: at })
    .eq('enquiry_id', enquiry.id)
    .is('sequence_stopped_at', null)
    .then(
      () => null,
      () => null
    );

  // They answered — stop chasing.
  await db
    .from('whatsapp_outbox')
    .update({ status: 'cancelled', last_error: 'They replied' })
    .eq('enquiry_id', enquiry.id)
    .eq('status', 'pending')
    .eq('kind', 'chase');

  const queued = kind === 'text' && m.type !== 'reaction' ? await queueSmartReply(db, enquiry, body, m.id) : null;

  const who = enquiry.name || `+${m.from}`;
  const lines = [body.slice(0, 140)];
  if (queued) lines.push(`Smart reply “${queued.rule}” sends in ~${Math.max(1, Math.round(queued.seconds / 60))} min — tap to check, edit or cancel.`);
  await notifyEnquiryTeam(created ? `New WhatsApp lead: ${who}` : `WhatsApp from ${who}`, lines.join('\n'), inboxHref(enquiry.id), {
    tag: chatTag(enquiry.id),
    ref: chatRef(enquiry.id),
    ...(queued?.outboxId
      ? {
          actions: [
            { action: 'outbox-send', title: 'Send now' },
            { action: 'outbox-cancel', title: 'Cancel reply' },
          ],
          data: { outboxId: queued.outboxId },
        }
      : {}),
  });
  // Read while that went out (the chat is open somewhere): the notification can go straight away.
  const { data: seen } = await db.from('enquiries').select('wa_unread').eq('id', enquiry.id).maybeSingle();
  if (seen && !seen.wa_unread) await clearChatNotifications(enquiry.id);
}

/** Queue the matching smart reply, unless a person is handling this chat. */
async function queueSmartReply(db: Db, enquiry: EnquiryWa, text: string, replyTo: string) {
  if (enquiry.wa_auto_off || !text.trim()) return null;

  const since = new Date(Date.now() - HUMAN_TAKEOVER_MS).toISOString();
  const { data: human } = await db
    .from('whatsapp_messages')
    .select('id')
    .eq('enquiry_id', enquiry.id)
    .eq('direction', 'out')
    .or('sent_by.not.is.null,via.eq.whatsapp-app')
    .gte('created_at', since)
    .limit(1);
  if (human?.length) return null;

  const { data: rules } = await db.from('whatsapp_rules').select('*').eq('enabled', true);
  const rule = matchRule(text, (rules ?? []) as SmartRule[]);
  if (!rule) return null;

  // Don't answer the same question twice in a day.
  const day = new Date(Date.now() - SERVICE_WINDOW_MS).toISOString();
  const [{ data: sent }, { data: pending }] = await Promise.all([
    db.from('whatsapp_messages').select('id').eq('enquiry_id', enquiry.id).eq('rule_id', rule.id).gte('created_at', day).limit(1),
    db.from('whatsapp_outbox').select('id').eq('enquiry_id', enquiry.id).eq('rule_id', rule.id).eq('status', 'pending').limit(1),
  ]);
  if (sent?.length || pending?.length) return null;

  const settings = await getSettings();
  let at = new Date(Date.now() + pickDelaySeconds(rule.delay_min_seconds, rule.delay_max_seconds) * 1000);
  if (settings.smartRepliesQuietHours) at = nextAwake(at, settings.quietFrom, settings.quietTo);
  const { data: row } = await db
    .from('whatsapp_outbox')
    .insert({
      enquiry_id: enquiry.id,
      rule_id: rule.id,
      kind: 'reply',
      body: fillReply(rule.reply, enquiry.name),
      reply_to: replyTo,
      send_after: at.toISOString(),
    })
    .select('id')
    .single();
  return { rule: rule.name, seconds: (at.getTime() - Date.now()) / 1000, outboxId: row?.id as string | undefined };
}

/**
 * Opening message to a new Meta lead who opted in, a few minutes later: the template picked in
 * WhatsApp templates → Use for, else WHATSAPP_DEFAULT_TEMPLATE.
 */
export async function queueFirstContact(enquiryId: string, name: string) {
  if (process.env.WHATSAPP_AUTO_FIRST_MESSAGE !== 'true') return false;
  const t = { ...defaultTemplate(), name: (await getSettings()).firstContactTemplate || defaultTemplate().name };
  if (!t.name) return false;
  const db = createAdminClient();
  const seconds = pickDelaySeconds(180, 360);
  const { error } = await db.from('whatsapp_outbox').insert({
    enquiry_id: enquiryId,
    kind: 'intro',
    template_name: t.name,
    template_lang: t.lang,
    body: (name || '').trim().split(/\s+/)[0] || 'there', // the template's {{1}}
    send_after: new Date(Date.now() + seconds * 1000).toISOString(),
  });
  return !error;
}

type Status = { id: string; status: string; timestamp?: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] };
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

export async function handleStatus(s: Status) {
  const db = createAdminClient();
  const { data: msg } = await db
    .from('whatsapp_messages')
    .select('id, status, enquiry_id')
    .eq('wa_message_id', s.id)
    .maybeSingle();
  if (!msg) return;
  const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
  if (s.status === 'failed') {
    const e = s.errors?.[0];
    const reason = e?.error_data?.details || e?.message || e?.title || 'Not delivered';
    await db.from('whatsapp_messages').update({ status: 'failed', error: reason, status_at: at }).eq('id', msg.id);
    await notifyEnquiryTeam('WhatsApp message not delivered', reason, inboxHref(msg.enquiry_id));
    return;
  }
  if ((RANK[s.status] || 0) > (RANK[msg.status] || 0)) {
    await db.from('whatsapp_messages').update({ status: s.status, status_at: at }).eq('id', msg.id);
  }
}

type SendInput =
  | { text: string }
  | { template: string; lang: string; params?: string[] };

async function deliver(
  db: Db,
  enquiry: EnquiryWa,
  input: SendInput,
  meta: { sentBy?: string | null; ruleId?: string | null; via?: string | null }
) {
  const to = enquiry.wa_id || toWaId(enquiry.phone);
  if (!to) return { ok: false as const, error: 'This lead has no valid mobile number.' };
  if (!enquiry.wa_id) await db.from('enquiries').update({ wa_id: to }).eq('id', enquiry.id);

  const isText = 'text' in input;
  if (isText && !windowOpen(enquiry.wa_last_inbound_at)) {
    return {
      ok: false as const,
      error: 'The 24-hour reply window is closed — WhatsApp only allows a template until they message back.',
    };
  }
  const r = isText ? await sendText(to, input.text) : await sendTemplate(to, input.template, input.lang, input.params ?? []);
  if (!r.ok) return r;

  const now = new Date().toISOString();
  const body = isText ? input.text : `Template “${input.template}”${input.params?.length ? ` (${input.params.join(', ')})` : ''}`;
  const { data: row } = await db
    .from('whatsapp_messages')
    .insert({
      enquiry_id: enquiry.id,
      wa_message_id: r.data.messages?.[0]?.id ?? null,
      direction: 'out',
      kind: isText ? 'text' : 'template',
      body,
      template_name: isText ? null : input.template,
      status: 'sent',
      sent_by: meta.sentBy ?? null,
      rule_id: meta.ruleId ?? null,
      via: meta.via ?? null,
      created_at: now,
    })
    .select('id')
    .single();
  await db
    .from('enquiries')
    .update({ wa_last_message_at: now, ...(enquiry.status === 'new' && meta.sentBy ? { status: 'contacted' } : {}) })
    .eq('id', enquiry.id);
  if (meta.sentBy || meta.via === 'whatsapp-app') await markFirstContact(db, enquiry.id, now);
  return { ok: true as const, id: row?.id as string | undefined };
}

/**
 * A team member sending from the inbox. Cancels any smart reply or chaser still waiting, and
 * optionally sets a new chaser for if they don't answer this one.
 */
export async function sendManual(enquiryId: string, userId: string, input: SendInput, chaseHours?: number | null) {
  if (!whatsappConfigured()) return { ok: false as const, error: 'WhatsApp is not connected yet — see WHATSAPP_SETUP.md.' };
  const db = createAdminClient();
  const { data: enquiry } = await db.from('enquiries').select(ENQ_COLS).eq('id', enquiryId).single();
  if (!enquiry) return { ok: false as const, error: 'Enquiry not found' };
  const r = await deliver(db, enquiry as EnquiryWa, input, { sentBy: userId });
  if (r.ok) {
    await cancelAutomatic(db, enquiryId, 'Replied by hand');
    if (chaseHours && chaseHours > 0) await scheduleChase(db, enquiry as EnquiryWa, { hours: chaseHours });
  }
  return r;
}

/** A person has replied (here or in the WhatsApp app): pending smart replies and chasers go. */
async function cancelAutomatic(db: Db, enquiryId: string, reason: string) {
  await db
    .from('whatsapp_outbox')
    .update({ status: 'cancelled', last_error: reason })
    .eq('enquiry_id', enquiryId)
    .eq('status', 'pending')
    .in('kind', ['reply', 'chase']);
}

/**
 * Chase if they don't answer: `hours` from now, outside quiet hours, and — when it can be —
 * inside the free 24h window. Replaces any chaser already waiting on this chat.
 */
export async function scheduleChase(db: Db, enquiry: EnquiryWa, opts: { hours: number; text?: string | null; step?: number }) {
  const settings = await getSettings();
  const step = opts.step ?? 1;
  const plan =
    step === 1
      ? planChase({
          sentAt: new Date(),
          hours: opts.hours,
          lastInboundAt: enquiry.wa_last_inbound_at,
          quietFrom: settings.quietFrom,
          quietTo: settings.quietTo,
          keepFree: settings.keepChasesFree,
        })
      : { at: nextAwake(new Date(Date.now() + opts.hours * 3_600_000), settings.quietFrom, settings.quietTo), free: false };
  await db
    .from('whatsapp_outbox')
    .update({ status: 'cancelled', last_error: 'Replaced by a newer chaser' })
    .eq('enquiry_id', enquiry.id)
    .eq('status', 'pending')
    .eq('kind', 'chase');
  await db.from('whatsapp_outbox').insert({
    enquiry_id: enquiry.id,
    kind: 'chase',
    chase_step: step,
    body: fillReply(opts.text || settings.chaseText, enquiry.name),
    send_after: plan.at.toISOString(),
  });
  return plan;
}

/** Opening a chat: blue ticks for the customer, unread badge cleared for us, its notifications gone for everyone. */
export async function markChatRead(enquiryId: string) {
  const db = createAdminClient();
  const { data: unread } = await db
    .from('whatsapp_messages')
    .select('id, wa_message_id')
    .eq('enquiry_id', enquiryId)
    .eq('direction', 'in')
    .eq('status', 'received')
    .order('created_at', { ascending: false });
  await Promise.all([db.from('enquiries').update({ wa_unread: 0 }).eq('id', enquiryId), clearChatNotifications(enquiryId)]);
  if (!unread?.length) return;
  await db.from('whatsapp_messages').update({ status: 'read' }).in('id', unread.map((u) => u.id));
  const latest = unread[0].wa_message_id;
  if (latest && whatsappConfigured()) await markRead(latest); // marks everything before it read too
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send whatever in the outbox is due. Run every minute (Supabase pg_cron) and opportunistically
 * from the webhook and the inbox. Each item is claimed first, so overlapping runs never double-send.
 */
export async function processOutbox(limit = 8) {
  if (!whatsappConfigured()) return { sent: 0, failed: 0, skipped: 'not configured' };
  const db = createAdminClient();
  const { data: due } = await db
    .from('whatsapp_outbox')
    .select('id')
    .eq('status', 'pending')
    .lte('send_after', new Date().toISOString())
    .order('send_after')
    .limit(limit);

  type Item = {
    id: string;
    enquiry_id: string;
    kind: 'reply' | 'intro' | 'chase';
    chase_step: number;
    rule_id: string | null;
    body: string | null;
    template_name: string | null;
    template_lang: string | null;
    reply_to: string | null;
    attempts: number;
  };
  const claimed: Item[] = [];
  for (const { id } of due ?? []) {
    const { data } = await db
      .from('whatsapp_outbox')
      .update({ status: 'sending' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, enquiry_id, kind, chase_step, rule_id, body, template_name, template_lang, reply_to, attempts')
      .maybeSingle();
    if (data) claimed.push(data as Item);
  }
  if (!claimed.length) return { sent: 0, failed: 0 };
  const settings = await getSettings();

  // Read receipt + "typing…" first, then a pause in proportion to the reply — like someone typing it.
  const typingFor = claimed.filter((i) => i.reply_to && !i.template_name);
  await Promise.all(typingFor.map((i) => markRead(i.reply_to!, true)));
  if (typingFor.length) {
    const longest = Math.max(...typingFor.map((i) => (i.body || '').length));
    await sleep(Math.min(15_000, 3_000 + longest * 35));
  }

  let sent = 0;
  let failed = 0;
  for (const item of claimed) {
    const { data: enquiry } = await db.from('enquiries').select(ENQ_COLS).eq('id', item.enquiry_id).maybeSingle();
    if (!enquiry || (item.rule_id && (enquiry as EnquiryWa).wa_auto_off)) {
      await db.from('whatsapp_outbox').update({ status: 'cancelled', last_error: 'Smart replies turned off' }).eq('id', item.id);
      continue;
    }
    const e = enquiry as EnquiryWa;
    const giveUp = async (title: string, error: string) => {
      failed++;
      await db.from('whatsapp_outbox').update({ status: 'failed', attempts: item.attempts + 1, last_error: error }).eq('id', item.id);
      await notifyEnquiryTeam(title, error, inboxHref(item.enquiry_id));
    };
    let input: SendInput;
    if (item.kind === 'chase' && !windowOpen(e.wa_last_inbound_at)) {
      // Past the free window: WhatsApp only allows a template now.
      const name = settings.chaseTemplate || process.env.WHATSAPP_CHASE_TEMPLATE || settings.firstContactTemplate || defaultTemplate().name;
      if (!name) {
        await giveUp(`Couldn’t chase ${e.name}`, 'The free 24h window has closed and no chase template is set (Smart replies → Chasers).');
        continue;
      }
      const p = await autoParams(name, e.id, e.name);
      if (!p.ok) {
        await giveUp(`Couldn’t chase ${e.name}`, p.error);
        continue;
      }
      input = { template: name, lang: defaultTemplate().lang, params: p.params ?? [(e.name || '').trim().split(/\s+/)[0] || 'there'] };
    } else if (item.template_name) {
      // Blanks by field when the template's are known (WhatsApp templates); else {{1}} = the first name queued with it.
      const p = await autoParams(item.template_name, e.id, e.name);
      if (!p.ok) {
        await giveUp(`WhatsApp to ${e.name} not sent`, p.error);
        continue;
      }
      input = { template: item.template_name, lang: item.template_lang || 'en_GB', params: p.params ?? (item.body ? [item.body] : []) };
    } else {
      input = { text: item.body || '' };
    }
    const r = await deliver(db, e, input, { ruleId: item.rule_id, via: item.kind === 'chase' ? 'chase' : null });
    if (r.ok) {
      sent++;
      await db.from('whatsapp_outbox').update({ status: 'sent', attempts: item.attempts + 1 }).eq('id', item.id);
      if (item.kind === 'intro') await db.from('enquiries').update({ status: 'contacted' }).eq('id', item.enquiry_id).eq('status', 'new');
      await afterAutoSend(db, e, item, settings);
    } else {
      const attempts = item.attempts + 1;
      const retry = attempts < 3 && !r.error.includes('window is closed');
      if (!retry) failed++;
      await db
        .from('whatsapp_outbox')
        .update(
          retry
            ? { status: 'pending', attempts, last_error: r.error, send_after: new Date(Date.now() + 60_000).toISOString() }
            : { status: 'failed', attempts, last_error: r.error }
        )
        .eq('id', item.id);
      if (!retry) await notifyEnquiryTeam(`WhatsApp reply to ${(enquiry as EnquiryWa).name} failed`, r.error, inboxHref(item.enquiry_id));
    }
  }
  return { sent, failed };
}

/** What follows an automatic message: a smart reply's chaser, or a chase's final nudge. */
async function afterAutoSend(
  db: Db,
  enquiry: EnquiryWa,
  item: { kind: string; chase_step: number; rule_id: string | null },
  settings: Awaited<ReturnType<typeof getSettings>>
) {
  if (item.kind === 'reply' && item.rule_id) {
    const { data: rule } = await db.from('whatsapp_rules').select('follow_up_hours, follow_up_text').eq('id', item.rule_id).maybeSingle();
    if (rule?.follow_up_hours) await scheduleChase(db, enquiry, { hours: Number(rule.follow_up_hours), text: rule.follow_up_text });
  } else if (item.kind === 'chase' && item.chase_step === 1 && settings.finalNudgeHours > 0) {
    await scheduleChase(db, enquiry, { hours: settings.finalNudgeHours, step: 2 });
  } else if (item.kind === 'chase') {
    await notifyEnquiryTeam(
      `Chased ${enquiry.name}`,
      'No reply yet, so the chaser has gone. Nothing more is scheduled.',
      inboxHref(enquiry.id)
    );
  }
}

export type MessageEcho = InboundMessage & { to: string };

/**
 * A message you typed in the WhatsApp Business app (coexistence). It's saved to the chat, counts as a
 * person replying (smart replies hold off, pending ones are cancelled) and, if it asks a question,
 * gets a chaser like one sent from Heliaxis.
 */
export async function handleEcho(m: MessageEcho) {
  const db = createAdminClient();
  const { data: dup } = await db.from('whatsapp_messages').select('id').eq('wa_message_id', m.id).maybeSingle();
  if (dup) return;
  const { enquiry } = await enquiryForNumber(db, m.to, '', null);
  const { kind, body } = describe(m);
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();
  const { error } = await db.from('whatsapp_messages').insert({
    enquiry_id: enquiry.id,
    wa_message_id: m.id,
    direction: 'out',
    kind,
    body,
    status: 'sent',
    via: 'whatsapp-app',
    created_at: at,
  });
  if (error) {
    if (error.code === '23505') return;
    throw new Error(error.message);
  }
  // Replying in the app means they've read the chat there, so it isn't unread here either.
  await db
    .from('enquiries')
    .update({ wa_last_message_at: at, wa_unread: 0, ...(enquiry.status === 'new' ? { status: 'contacted' } : {}) })
    .eq('id', enquiry.id);
  await cancelAutomatic(db, enquiry.id, 'Replied in the WhatsApp app');
  await markFirstContact(db, enquiry.id, at);
  const settings = await getSettings();
  if (settings.chaseQuestions && body.includes('?')) await scheduleChase(db, enquiry, { hours: settings.chaseAfterHours });
}

/**
 * Monitoring: push the team when a customer's message has gone unanswered for a while (once per
 * message). Runs with the outbox every minute.
 */
export async function remindUnanswered() {
  const settings = await getSettings();
  // Not at night: overnight messages get their reminder when quiet hours end.
  if (!settings.remindUnansweredMinutes || isQuiet(new Date(), settings.quietFrom, settings.quietTo)) return 0;
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - settings.remindUnansweredMinutes * 60_000).toISOString();
  const dayAgo = new Date(Date.now() - SERVICE_WINDOW_MS).toISOString();
  const { data } = await db
    .from('enquiries')
    .select('id, name, wa_last_inbound_at, wa_reminded_at')
    .lte('wa_last_inbound_at', cutoff)
    .gte('wa_last_inbound_at', dayAgo)
    .limit(50);
  let n = 0;
  for (const e of data ?? []) {
    if (e.wa_reminded_at && e.wa_reminded_at >= e.wa_last_inbound_at) continue;
    const [{ data: out }, { data: queued }] = await Promise.all([
      db.from('whatsapp_messages').select('id').eq('enquiry_id', e.id).eq('direction', 'out').gte('created_at', e.wa_last_inbound_at).limit(1),
      db.from('whatsapp_outbox').select('id').eq('enquiry_id', e.id).eq('status', 'pending').eq('kind', 'reply').limit(1),
    ]);
    await db.from('enquiries').update({ wa_reminded_at: new Date().toISOString() }).eq('id', e.id);
    if (out?.length || queued?.length) continue;
    n++;
    const mins = Math.round((Date.now() - new Date(e.wa_last_inbound_at).getTime()) / 60_000);
    await notifyEnquiryTeam(
      `${e.name} is waiting for a reply`,
      `Their WhatsApp message has had no answer for ${mins >= 90 ? `${Math.round(mins / 60)}h` : `${mins} min`}.`,
      inboxHref(e.id),
      { ref: replyRef(e.id) }
    );
  }
  return n;
}

/**
 * Someone on the team messaged this customer (here or in the WhatsApp Business app). The first time
 * counts as first contact (speed to lead; the new-lead alerts go). And replying means they've read
 * it: the chat's notifications and "… is waiting for a reply" go, for everyone.
 */
export async function markFirstContact(_db: Db, enquiryId: string, at = new Date().toISOString()) {
  await Promise.all([markContacted({ enquiryId }, at), clearChatNotifications(enquiryId), clearReplyNotifications(enquiryId)]);
}

/**
 * An automatic message (reminder, sequence step, review request): free text inside the 24h window,
 * otherwise the given template. Returns why it couldn't send.
 */
export async function sendSystem(
  enquiryId: string,
  msg: { text: string; template?: string | null; params?: string[] },
  via: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp not connected' };
  const db = createAdminClient();
  const { data: enquiry } = await db.from('enquiries').select(ENQ_COLS).eq('id', enquiryId).maybeSingle();
  if (!enquiry) return { ok: false, error: 'Customer not found' };
  const e = enquiry as EnquiryWa;
  if (!e.wa_id && !toWaId(e.phone)) return { ok: false, error: 'No mobile number' };
  const input: SendInput = windowOpen(e.wa_last_inbound_at)
    ? { text: msg.text }
    : msg.template
      ? { template: msg.template, lang: defaultTemplate().lang, params: msg.params ?? [] }
      : { text: '' };
  if ('text' in input && !input.text) return { ok: false, error: 'Outside the 24h window and no template set' };
  const r = await deliver(db, e, input, { via });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Send a document (from the opportunity or the library) on WhatsApp. Needs the 24h window open. */
export async function sendWhatsAppDocument(enquiryId: string, userId: string, link: string, filename: string, caption?: string) {
  if (!whatsappConfigured()) return { ok: false as const, error: 'WhatsApp is not connected yet.' };
  const db = createAdminClient();
  const { data: enquiry } = await db.from('enquiries').select(ENQ_COLS).eq('id', enquiryId).maybeSingle();
  if (!enquiry) return { ok: false as const, error: 'Customer not found' };
  const e = enquiry as EnquiryWa;
  const to = e.wa_id || toWaId(e.phone);
  if (!to) return { ok: false as const, error: 'This customer has no mobile number.' };
  if (!windowOpen(e.wa_last_inbound_at)) {
    return { ok: false as const, error: 'Documents can only be sent within 24h of their last message — send it by email, or put it in their portal.' };
  }
  const r = await sendDocument(to, link, filename, caption);
  if (!r.ok) return r;
  const now = new Date().toISOString();
  await db.from('whatsapp_messages').insert({
    enquiry_id: e.id,
    wa_message_id: r.data.messages?.[0]?.id ?? null,
    direction: 'out',
    kind: 'document',
    body: `📄 ${filename}${caption ? ` — ${caption}` : ''}`,
    status: 'sent',
    sent_by: userId,
    created_at: now,
  });
  await db.from('enquiries').update({ wa_last_message_at: now }).eq('id', e.id);
  await markFirstContact(db, e.id, now);
  return { ok: true as const };
}
