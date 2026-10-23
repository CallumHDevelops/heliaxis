import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearChatNotifications, clearReplyNotifications, notify, type NotificationInput } from '@/lib/notify';
import { chatHref, chatRef, chatTag, replyRef } from '@/lib/notification-refs';
import { canAccess } from '@/lib/portals';
import { inboundMediaColumns, storeMediaSoon } from './media';
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
import { atWords, freeAt, holdUntil, isQuiet, nextAwake, planChase, scheduledAnswers, windowClosesAt, windowShutWords } from './schedule';
import { LATER_COLS, LATER_SETUP, sendLaterReady } from './send-later';
import { ensureOpportunity, logActivity, markContacted } from '@/lib/crm/server';
import { getSettings } from './settings';
import { adMessageFor, type LeadAd } from './first-messages-shared';
import { getFirstMessages, sendsByItself } from './first-messages';
import { autoParams } from './templates';
import { describeMessage as describe, type InboundMessage } from './describe';
import { applyStopReply, grantPermission, START_REPLY, STOP_REPLY, stopWord, waPermission } from './permission';
import { templateText } from './template-text';
import { saveAdIds } from '@/lib/meta-ads';
import { mergedInto, replyNumberFromAlias } from '@/lib/crm/aliases';
import { tradeEcho, tradeReply } from '@/lib/site/trade-reply';

/**
 * The WhatsApp inbox: inbound messages from the webhook, delivery statuses, smart replies
 * (queued in whatsapp_outbox and sent after a human-looking delay), chasers when a customer
 * goes quiet, messages typed in the WhatsApp Business app (coexistence echoes), and sending by hand,
 * now or later (Send later and the late-night rule: queued as 'scheduled', sent as the person).
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

/** The lead this WhatsApp number belongs to; creates one for a brand-new number. `inbound` false: one we sent from the app. */
async function enquiryForNumber(
  db: Db,
  waId: string,
  profileName: string,
  referral: InboundMessage['referral'] | null,
  inbound = true
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

  // A number kept on a customer when two records were merged (src/lib/crm/merge.ts): theirs, replying to it now.
  const merged = await replyNumberFromAlias(db, waId, inbound);
  if (merged) return { enquiry: merged as unknown as EnquiryWa, created: false };

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
  // The ad they tapped, for the ad spend in Reports (ad-spend.sql; a no-op before it's run).
  if (referral?.source_type === 'ad' && referral.source_id) await saveAdIds(row.id as string, { ad_id: referral.source_id });
  return { enquiry: row as EnquiryWa, created: true };
}

/** The customer a record was merged into just as a message for it came in (src/lib/crm/merge.ts), or null. */
async function mergedEnquiry(db: Db, id: string): Promise<EnquiryWa | null> {
  const hit = await mergedInto('customer', id, db);
  if (!hit) return null;
  const { data } = await db.from('enquiries').select(ENQ_COLS).eq('id', hit.enquiry_id).maybeSingle();
  return (data as EnquiryWa | null) ?? null;
}

// What each kind of message says in the chat: describe.ts (pure, so it can be tested).
export type { InboundMessage };

export async function handleInboundMessage(m: InboundMessage, profileName: string) {
  const db = createAdminClient();
  const { data: dup } = await db.from('whatsapp_messages').select('id').eq('wa_message_id', m.id).maybeSingle();
  if (dup) return; // Meta retries webhooks
  // A trade answering a site message (job pack, PO, return to site) goes on their job, not into the
  // leads (SPEC D20, src/lib/site/trade-reply.ts). If that can't be checked, the message isn't lost.
  if (await tradeReply(db, m, notifyEnquiryTeam).catch(() => false)) return;

  const found = await enquiryForNumber(db, m.from, profileName, m.referral ?? null);
  const created = found.created;
  let enquiry = found.enquiry;
  if (created) await ensureOpportunity(enquiry.id, m.referral ? 'WhatsApp ad' : 'WhatsApp');
  const { kind, body } = describe(m);
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();
  const media = await inboundMediaColumns(m); // a photo, voice note or file to fetch (whatsapp-media.sql)

  const row = {
    wa_message_id: m.id,
    direction: 'in',
    kind,
    body,
    status: 'received',
    created_at: at,
    ...media,
  };
  let { error } = await db.from('whatsapp_messages').insert({ enquiry_id: enquiry.id, ...row });
  // Merged into another customer while this came in: it's theirs now (Meta won't send it again; the webhook has answered).
  const mergedTo = error?.code === '23503' ? await mergedEnquiry(db, enquiry.id) : null;
  if (mergedTo) {
    enquiry = mergedTo;
    ({ error } = await db.from('whatsapp_messages').insert({ enquiry_id: mergedTo.id, ...row }));
  }
  if (error) {
    if (error.code === '23505') return; // a parallel retry got there first
    throw new Error(error.message);
  }
  if (media.media_id) storeMediaSoon(m.id); // downloaded from WhatsApp alongside the rest of this
  await db
    .from('enquiries')
    .update({
      wa_last_inbound_at: at,
      wa_last_message_at: at,
      wa_unread: (enquiry.wa_unread || 0) + 1,
    })
    .eq('id', enquiry.id);

  // STOP / START change their WhatsApp permission; any other message from them counts as agreeing
  // (the first time; it never undoes a STOP).
  const word = kind === 'text' ? stopWord(body) : null;
  // A message someone scheduled stays scheduled, and its author hears so once. STOP cancels it, and
  // its author hears that instead (stopOrStart).
  if (m.type !== 'reaction' && word !== 'stop') await tellScheduledAuthors(db, enquiry);
  const kept = word ? await stopOrStart(db, { ...enquiry, wa_last_inbound_at: at }, m.from, word, at) : false;
  if (!word) await grantPermission(enquiry.id, 'inbound', { at });

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

  const queued = kind === 'text' && m.type !== 'reaction' && !word ? await queueSmartReply(db, enquiry, body, m.id) : null;

  const who = enquiry.name || `+${m.from}`;
  const lines = [body.slice(0, 140)];
  if (word && !kept) lines.push('Run crm-v3.sql in Supabase (it’s on the to-do list) so the app can keep STOP replies.');
  else if (word === 'stop') lines.push('Automatic WhatsApps to them are now off. You can still reply by hand.');
  else if (word === 'start') lines.push('Automatic WhatsApps to them are back on.');
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

/**
 * STOP: no more automatic WhatsApps to anyone with this number (whatever the permission rule says),
 * with one confirmation; nothing queued for them goes. START turns them back on. Logged on each.
 * False if it couldn't be kept (crm-v3.sql not run yet), so nothing is promised.
 */
async function stopOrStart(db: Db, enquiry: EnquiryWa, waId: string, word: 'stop' | 'start', at: string): Promise<boolean> {
  const { changed, all, recorded } = await applyStopReply(waId, word, at);
  if (!all.includes(enquiry.id)) all.push(enquiry.id);
  if (word === 'stop') {
    const later = await sendLaterReady(); // who wrote a scheduled message: only after whatsapp-scheduled.sql
    const { data: gone } = await db
      .from('whatsapp_outbox')
      .update({ status: 'cancelled', last_error: 'They replied STOP' })
      .in('enquiry_id', all)
      .eq('status', 'pending')
      .select(later ? 'id, kind, enquiry_id, send_after, sent_by' : 'id');
    // Each message someone scheduled for them (on any enquiry with this number) won't go: its author
    // hears, replacing any "still scheduled" push. Only what this cancelled, so one already going isn't.
    const now = new Date();
    const first = (enquiry.name || '').trim().split(/\s+/)[0] || 'They';
    for (const item of (gone ?? []) as unknown as { id: string; kind?: string; enquiry_id?: string; send_after?: string; sent_by?: string | null }[]) {
      if (item.kind !== 'scheduled' || !item.sent_by) continue;
      await notify({
        userId: item.sent_by,
        kind: 'whatsapp',
        title: `${first} replied STOP: your message for ${atWords(new Date(item.send_after!), now)} won’t go`,
        body: 'Nothing goes to them automatically now. You can still message them by hand.',
        href: inboxHref(item.enquiry_id!),
        tag: `wa-later-${item.id}`,
      });
    }
  }
  if (!recorded) return false;
  if (!changed.length) return true; // already stopped (or started): they've had the confirmation
  if (whatsappConfigured()) await deliver(db, enquiry, { text: word === 'stop' ? STOP_REPLY : START_REPLY }, { via: 'stop-reply' });
  const body =
    word === 'stop'
      ? 'Replied STOP: no more automatic WhatsApp messages (reminders, follow-ups, smart replies)'
      : 'Replied START: automatic WhatsApp messages are back on';
  await Promise.all(changed.map((id) => logActivity({ enquiryId: id, kind: 'system', body }).catch(() => null)));
  return true;
}

/**
 * The customer has written while a message someone scheduled is still waiting to go. It stays
 * scheduled, and its author hears once per message: Cancel on the notification, and the chat a tap
 * away to edit it or send it now. (STOP cancels it instead: stopOrStart tells its author.)
 */
async function tellScheduledAuthors(db: Db, enquiry: EnquiryWa) {
  if (!(await sendLaterReady())) return;
  const { data } = await db
    .from('whatsapp_outbox')
    .select('id, sent_by, send_after')
    .eq('enquiry_id', enquiry.id)
    .eq('kind', 'scheduled')
    .eq('status', 'pending')
    .is('reply_noted_at', null);
  const now = new Date();
  const first = (enquiry.name || '').trim().split(/\s+/)[0] || 'They';
  for (const item of data ?? []) {
    // Marked first, so two webhooks at once still tell them once.
    const { data: mine } = await db
      .from('whatsapp_outbox')
      .update({ reply_noted_at: now.toISOString() })
      .eq('id', item.id)
      .is('reply_noted_at', null)
      .select('id');
    if (!mine?.length || !item.sent_by) continue;
    const when = atWords(new Date(item.send_after), now);
    await notify({
      userId: item.sent_by,
      kind: 'whatsapp',
      title: `${first} replied — your message for ${when} is still scheduled`,
      body: 'Cancel it here, or open the chat to edit it or send it now.',
      href: inboxHref(enquiry.id),
      tag: `wa-later-${item.id}`,
      actions: [
        { action: 'outbox-cancel', title: 'Cancel message' },
        { action: 'open', title: 'Edit' },
      ],
      data: { outboxId: item.id as string },
    });
  }
}

/** Queue the matching smart reply, unless a person is handling this chat. */
async function queueSmartReply(db: Db, enquiry: EnquiryWa, text: string, replyTo: string) {
  if (enquiry.wa_auto_off || !text.trim()) return null;

  const since = new Date(Date.now() - HUMAN_TAKEOVER_MS).toISOString();
  const [{ data: human }, { data: later }] = await Promise.all([
    db
      .from('whatsapp_messages')
      .select('id')
      .eq('enquiry_id', enquiry.id)
      .eq('direction', 'out')
      .or('sent_by.not.is.null,via.eq.whatsapp-app')
      .gte('created_at', since)
      .limit(1),
    // Someone's written a reply that's waiting to go (Send later): that's the answer.
    db.from('whatsapp_outbox').select('id').eq('enquiry_id', enquiry.id).eq('kind', 'scheduled').eq('status', 'pending').limit(1),
  ]);
  if (human?.length || later?.length) return null;

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
  if (settings.smartRepliesQuietHours) at = nextAwake(at, settings);
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
 * Opening message to a new Meta lead who opted in, 8–13 minutes later (WhatsApp templates → First
 * messages): the template chosen for the ad they came from, else the one picked in WhatsApp
 * templates → Use for, else WHATSAPP_DEFAULT_TEMPLATE. Only while first messages go by themselves
 * (switched on there, or WHATSAPP_AUTO_FIRST_MESSAGE in Vercel). It waits in their chat until then,
 * with Send now and Cancel. Null when nothing was queued.
 */
export async function queueFirstContact(enquiryId: string, name: string, ad: LeadAd = { names: [] }) {
  const first = await getFirstMessages();
  if (!sendsByItself(first)) return null;
  const settings = await getSettings();
  const own = adMessageFor(first.byAd, ad);
  const t = { ...defaultTemplate(), name: own?.template || settings.firstContactTemplate || defaultTemplate().name };
  if (!t.name) return null;
  const db = createAdminClient();
  let at = new Date(Date.now() + pickDelaySeconds(first.minMinutes * 60, first.maxMinutes * 60) * 1000);
  // Enquired in quiet hours: held until the morning, if that's switched on (Smart replies → Chasers).
  if (settings.firstContactQuietHours) at = nextAwake(at, settings);
  const { error } = await db.from('whatsapp_outbox').insert({
    enquiry_id: enquiryId,
    kind: 'intro',
    template_name: t.name,
    template_lang: t.lang,
    body: (name || '').trim().split(/\s+/)[0] || 'there', // the template's {{1}}
    send_after: at.toISOString(),
  });
  return error ? null : { at, template: t.name, ad: own?.name ?? null };
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

export type SendInput =
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
  // Templates are saved as the customer saw them; the short note only if Meta can't say the wording.
  const body = isText
    ? input.text
    : ((await templateText(input.template, input.lang, input.params ?? []).catch(() => null)) ??
      `Template “${input.template}”${input.params?.length ? ` (${input.params.join(', ')})` : ''}`);
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

type Scheduled = { ok: true; id: string; at: string } | { ok: false; error: string; windowClosesAt?: string };

/**
 * A message a person has written, to go at `at`: Send later, or the late-night rule. It waits in the
 * outbox as 'scheduled' with its author, and goes at that time as them (quiet hours never hold it),
 * chased from then if `chaseHours`. A typed message must still be inside the free 24h window then
 * (`windowClosesAt` says when it closes, so the chat can offer another way); a template can go any
 * time. Smart replies still waiting go now (a person is handling the chat); a chaser stands down when
 * this goes, so cancelling it, or it failing, doesn't leave the chat unchased.
 */
export async function scheduleManual(enquiryId: string, userId: string, input: SendInput, at: Date, chaseHours?: number | null): Promise<Scheduled> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp is not connected yet — see WHATSAPP_SETUP.md.' };
  if (!(await sendLaterReady())) return { ok: false, error: LATER_SETUP };
  const db = createAdminClient();
  const { data: enquiry } = await db.from('enquiries').select(ENQ_COLS).eq('id', enquiryId).maybeSingle();
  if (!enquiry) return { ok: false, error: 'Enquiry not found' };
  const e = enquiry as EnquiryWa;
  if (!e.wa_id && !toWaId(e.phone)) return { ok: false, error: 'This lead has no valid mobile number.' };
  const isText = 'text' in input;
  if (isText && !freeAt(at, e.wa_last_inbound_at)) {
    const close = windowClosesAt(e.wa_last_inbound_at);
    return {
      ok: false,
      error: windowShutWords(e.name, e.wa_last_inbound_at, at, new Date()),
      ...(close ? { windowClosesAt: new Date(close).toISOString() } : {}),
    };
  }
  // A template is shown in the chat as the customer will see it; its blanks are kept as they were filled in.
  const body = isText
    ? input.text
    : ((await templateText(input.template, input.lang, input.params ?? []).catch(() => null)) ?? `Template “${input.template}”`);
  const { data: row, error } = await db
    .from('whatsapp_outbox')
    .insert({
      enquiry_id: e.id,
      kind: 'scheduled',
      sent_by: userId,
      body,
      template_name: isText ? null : input.template,
      template_lang: isText ? null : input.lang,
      template_params: isText ? null : (input.params ?? []),
      chase_hours: chaseHours && chaseHours > 0 ? chaseHours : null,
      send_after: at.toISOString(),
    })
    .select('id')
    .single();
  if (error || !row) return { ok: false, error: error?.message || 'Not scheduled' };
  await db
    .from('whatsapp_outbox')
    .update({ status: 'cancelled', last_error: 'A message is scheduled' })
    .eq('enquiry_id', e.id)
    .eq('status', 'pending')
    .eq('kind', 'reply');
  return { ok: true, id: row.id as string, at: at.toISOString() };
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
 * Chase if they don't answer: `hours` from now, outside quiet hours, after the evening rule (a
 * message sent after 18:00 isn't chased before 10:00 the next morning) and — when it can be — inside
 * the free 24h window. The final nudge (step 2) follows the same times but isn't moved to keep it
 * free. Replaces any chaser already waiting on this chat.
 */
export async function scheduleChase(db: Db, enquiry: EnquiryWa, opts: { hours: number; text?: string | null; step?: number }) {
  const settings = await getSettings();
  const step = opts.step ?? 1;
  const plan = planChase({
    sentAt: new Date(),
    hours: opts.hours,
    lastInboundAt: step === 1 ? enquiry.wa_last_inbound_at : null,
    settings,
    keepFree: step === 1 && settings.keepChasesFree,
  });
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

/** whatsapp_outbox.last_error on something a person pressed "Send now" on: it goes, quiet hours or not. */
export const SEND_NOW_NOTE = 'Send now pressed';

/** When we last messaged them (by hand, from the app or automatically), for the evening rule. */
async function lastOutboundAt(db: Db, enquiryId: string): Promise<Date | null> {
  const { data } = await db
    .from('whatsapp_messages')
    .select('created_at')
    .eq('enquiry_id', enquiryId)
    .eq('direction', 'out')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? new Date(data.created_at) : null;
}

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
    .order('created_at')
    .limit(limit);

  type Item = {
    id: string;
    enquiry_id: string;
    kind: 'reply' | 'intro' | 'chase' | 'scheduled';
    chase_step: number;
    rule_id: string | null;
    body: string | null;
    template_name: string | null;
    template_lang: string | null;
    reply_to: string | null;
    attempts: number;
    last_error: string | null;
    send_after: string;
    /** A scheduled message's (whatsapp-scheduled.sql): who wrote it, a template's blanks, and its chaser. */
    sent_by?: string | null;
    template_params?: string[] | null;
    chase_hours?: number | null;
    /** Its author was told the customer wrote while it waited (a push with Cancel on it). */
    reply_noted_at?: string | null;
  };
  // Asking for columns that aren't there yet would fail every claim, so only once the SQL has been run.
  const cols = `id, enquiry_id, kind, chase_step, rule_id, body, template_name, template_lang, reply_to, attempts, last_error, send_after${
    (await sendLaterReady()) ? `, ${LATER_COLS}, reply_noted_at` : ''
  }`;
  const picked: Item[] = [];
  for (const { id } of due ?? []) {
    const { data } = await db.from('whatsapp_outbox').update({ status: 'sending' }).eq('id', id).eq('status', 'pending').select(cols).maybeSingle();
    if (data) picked.push(data as unknown as Item);
  }
  if (!picked.length) return { sent: 0, failed: 0 };
  const settings = await getSettings();

  // The safety net: nothing goes on its own in quiet hours, and no chaser before the evening rule
  // allows (from our last message in the chat). It waits for the right time instead, so chasers
  // queued under older rules, or made due by a late run, follow today's settings too. A message a
  // person scheduled is never held: its time was their choice.
  const claimed: Item[] = [];
  let held = 0;
  const laterFor = new Set(picked.filter((i) => i.kind === 'scheduled').map((i) => i.enquiry_id));
  for (const item of picked) {
    // A chaser due with a message someone scheduled for that chat waits a run: if that goes, it stands down.
    if (item.kind === 'chase' && laterFor.has(item.enquiry_id)) {
      held++;
      await db.from('whatsapp_outbox').update({ status: 'pending' }).eq('id', item.id);
      continue;
    }
    const wait = holdUntil({
      kind: item.kind,
      now: new Date(),
      settings,
      lastOutAt: item.kind === 'chase' ? await lastOutboundAt(db, item.enquiry_id) : null,
      sendNow: item.last_error === SEND_NOW_NOTE,
    });
    if (!wait) {
      claimed.push(item);
      continue;
    }
    held++;
    await db.from('whatsapp_outbox').update({ status: 'pending', send_after: wait.toISOString() }).eq('id', item.id);
  }
  if (!claimed.length) return { sent: 0, failed: 0, held };

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
    const scheduled = item.kind === 'scheduled';
    // When it goes wrong: a scheduled message's author hears; the team for everything else.
    const tell = (title: string, body: string) =>
      scheduled && item.sent_by
        ? notify({ userId: item.sent_by, kind: 'whatsapp', title, body, href: inboxHref(item.enquiry_id), tag: `wa-later-${item.id}` })
        : notifyEnquiryTeam(title, body, inboxHref(item.enquiry_id));
    const giveUp = async (title: string, error: string) => {
      failed++;
      await db.from('whatsapp_outbox').update({ status: 'failed', attempts: item.attempts + 1, last_error: error }).eq('id', item.id);
      await tell(title, error);
    };
    // Automatic messages: check permission again just before they go. A scheduled message was written
    // by a person, so it goes as if they'd pressed Send then (no permission check, as by hand).
    const permission = scheduled ? { allowed: true, reason: '' } : await waPermission(e.id);
    if (!permission.allowed) {
      await db.from('whatsapp_outbox').update({ status: 'cancelled', last_error: `Not sent: ${permission.reason}` }).eq('id', item.id);
      continue;
    }
    let input: SendInput;
    if (scheduled && !item.template_name && !windowOpen(e.wa_last_inbound_at)) {
      // They've gone quiet since it was scheduled: past the free window WhatsApp only takes a template.
      const first = (e.name || '').trim().split(/\s+/)[0];
      await giveUp(
        `Your WhatsApp to ${e.name} didn’t go`,
        `Not sent: ${first || 'they'} ${first ? 'hasn’t' : 'haven’t'} messaged in the last 24 hours, so WhatsApp won’t take a typed message now. Open the chat to send it as a template instead.`
      );
      continue;
    } else if (scheduled) {
      input = item.template_name
        ? { template: item.template_name, lang: item.template_lang || defaultTemplate().lang, params: item.template_params ?? [] }
        : { text: item.body || '' };
    } else if (item.kind === 'chase' && !windowOpen(e.wa_last_inbound_at)) {
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
    // A scheduled message goes as its author (their name on it, counts as a person replying).
    const r = await deliver(db, e, input, scheduled ? { sentBy: item.sent_by ?? null } : { ruleId: item.rule_id, via: item.kind === 'chase' ? 'chase' : null });
    if (r.ok) {
      sent++;
      await db.from('whatsapp_outbox').update({ status: 'sent', attempts: item.attempts + 1 }).eq('id', item.id);
      if (scheduled) {
        // As when a person presses Send: what's automatic stands down, and the chaser counts from now.
        await cancelAutomatic(db, e.id, 'Replied by hand');
        if (Number(item.chase_hours) > 0) await scheduleChase(db, e, { hours: Number(item.chase_hours) });
        // Its author had "still scheduled" with a Cancel button: that push is replaced, so it can't say cancelled later.
        if (item.reply_noted_at && item.sent_by) {
          const first = (e.name || '').trim().split(/\s+/)[0] || 'them';
          const time = atWords(new Date(), new Date()).replace(/ today$/, '');
          await notify({ userId: item.sent_by, kind: 'whatsapp', title: `Your message to ${first} went at ${time}`, href: inboxHref(e.id), tag: `wa-later-${item.id}` });
        }
        continue;
      }
      if (item.kind === 'intro') await db.from('enquiries').update({ status: 'contacted' }).eq('id', item.enquiry_id).eq('status', 'new');
      await afterAutoSend(db, e, item, settings);
    } else {
      const attempts = item.attempts + 1;
      const retry = attempts < 3 && !r.error.includes('window is closed');
      if (!retry) failed++;
      // A "Send now" keeps its marker while it retries, so quiet hours don't hold it for the morning.
      const note = item.last_error === SEND_NOW_NOTE ? SEND_NOW_NOTE : r.error;
      await db
        .from('whatsapp_outbox')
        .update(
          retry
            ? { status: 'pending', attempts, last_error: note, send_after: new Date(Date.now() + 60_000).toISOString() }
            : { status: 'failed', attempts, last_error: r.error }
        )
        .eq('id', item.id);
      if (!retry) await tell(scheduled ? `Your WhatsApp to ${e.name} didn’t go` : `WhatsApp reply to ${e.name} failed`, r.error);
    }
  }
  return { sent, failed, held };
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
  // Typed to a trade: on their job's history, not a new customer (SPEC D20).
  if (await tradeEcho(db, m).catch(() => false)) return;
  let { enquiry } = await enquiryForNumber(db, m.to, '', null, false);
  const { kind, body } = describe(m);
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();
  const row = {
    wa_message_id: m.id,
    direction: 'out',
    kind,
    body,
    status: 'sent',
    via: 'whatsapp-app',
    created_at: at,
  };
  let { error } = await db.from('whatsapp_messages').insert({ enquiry_id: enquiry.id, ...row });
  // Merged into another customer meanwhile: theirs now (as in handleInboundMessage).
  const mergedTo = error?.code === '23503' ? await mergedEnquiry(db, enquiry.id) : null;
  if (mergedTo) {
    enquiry = mergedTo;
    ({ error } = await db.from('whatsapp_messages').insert({ enquiry_id: mergedTo.id, ...row }));
  }
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
  if (!settings.remindUnansweredMinutes || isQuiet(new Date(), settings)) return 0;
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
      db.from('whatsapp_outbox').select('kind, created_at').eq('enquiry_id', e.id).eq('status', 'pending').in('kind', ['reply', 'scheduled']),
    ]);
    await db.from('enquiries').update({ wa_reminded_at: new Date().toISOString() }).eq('id', e.id);
    // A smart reply on its way, or a reply someone scheduled since their message: they're not waiting on
    // us. One scheduled before they wrote doesn't answer what they've said since.
    const answered = (queued ?? []).some((q) => q.kind === 'reply' || scheduledAnswers(q.created_at, e.wa_last_inbound_at));
    if (out?.length || answered) continue;
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
  const permission = await waPermission(enquiryId);
  if (!permission.allowed) return { ok: false, error: permission.reason || 'No WhatsApp permission' };
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
