import 'server-only';
import { ukDay } from '@/lib/bank-holidays';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { emailShell, esc, sendEmail } from '@/lib/subcontractors/server';
import { defaultTemplate, sendTemplate, whatsappConfigured } from '@/lib/whatsapp/api';
import { getSettings as getWaSettings } from '@/lib/whatsapp/settings';
import { fetchTemplates } from '@/lib/whatsapp/templates';
import {
  clearToStartEmail,
  clearToStartParams,
  clearToStartText,
  clickToChat,
  jobPackEmail,
  jobPackParams,
  jobPackText,
  KIND_TEMPLATE,
  scaffoldHoldEmail,
  scaffoldHoldParams,
  scaffoldHoldText,
  sendAfter,
  siteShort,
  strikeEmail,
  strikeParams,
  type About,
  type EmailText,
  type MessageKind,
} from './messages';
import { logJob, logSiteEvent, type AssignmentRow, type ContactRow, type Db } from './server';
import { linkHashFor, linkTokenFor, siteLink } from './tokens';
import { firstNameOf, TRADE_LABEL } from './types';

/**
 * Sending to trades. Every email and WhatsApp is a site_messages row first: its dedupe_key can only
 * be used once (two taps on Send, a retried sign-off: one message), and its send_after is when it may
 * go (the evening rule, D19). Due ones go at once; held ones go from /api/cron/site. Email goes
 * through Resend; WhatsApp through the ready-made templates, only to people who agreed to job
 * messages on WhatsApp and only once the template is approved.
 */

const FROM = 'Heliaxis Site <noreply@heliaxis.co.uk>';
/** How long a message being sent is held from the next run (a crash mid-send is retried after this). */
const LEASE_MS = 10 * 60_000;

/* ── Links ───────────────────────────────────────────────────────────────────── */

/**
 * The assignment's link, made the first time it's needed (or a new one with `rotate`: the old one
 * stops working). The token isn't stored, so the same link can be copied again whenever; if the key
 * it was made with has changed since, a new one is made.
 */
export async function ensureLink(db: Db, a: AssignmentRow, rotate = false): Promise<{ token: string; generation: number; rotated: boolean }> {
  let generation = Math.max(1, a.link_generation);
  let fresh = !a.link_hash || a.link_generation === 0 || rotate;
  if (rotate && a.link_generation > 0) generation = a.link_generation + 1;
  if (!fresh && a.link_hash !== linkHashFor(a.id, generation)) {
    generation += 1;
    fresh = true;
  }
  if (fresh) {
    const now = new Date().toISOString();
    const { error } = await db
      .from('site_assignments')
      .update({ link_hash: linkHashFor(a.id, generation), link_generation: generation, link_created_at: now, updated_at: now })
      .eq('id', a.id);
    if (error) throw new Error(error.message);
    a.link_hash = linkHashFor(a.id, generation);
    a.link_generation = generation;
    a.link_created_at = now;
  }
  return { token: linkTokenFor(a.id, generation), generation, rotated: fresh && rotate };
}

/* ── What a message is about ─────────────────────────────────────────────────── */

export type Job = { ref: string | null; address: string | null; postcode: string | null };

export async function jobOf(db: Db, projectId: string): Promise<Job & { enquiry_id: string; owner_id: string | null }> {
  const { data: p } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  const { data: c } = p ? await db.from('enquiries').select('postcode, customer_ref').eq('id', p.enquiry_id).maybeSingle() : { data: null };
  return {
    ref: (p?.project_ref as string | null) || ((c as { customer_ref?: string } | null)?.customer_ref ?? null),
    address: (p?.address as string | null) ?? null,
    postcode: ((p?.postcode as string | null) || (c as { postcode?: string } | null)?.postcode) ?? null,
    enquiry_id: String(p?.enquiry_id ?? ''),
    owner_id: (p?.owner_id as string | null) ?? null,
  };
}

export const aboutOf = (a: AssignmentRow, c: ContactRow, job: Job, link: string): About => ({
  firstName: firstNameOf(c.name),
  trade: a.trade,
  startsOn: a.starts_on,
  site: siteShort(job.address, job.postcode),
  jobRef: job.ref,
  link,
});

/* ── WhatsApp: can it go? ────────────────────────────────────────────────────── */

let approved: { at: number; names: Set<string> } | null = null;
/** Approved template names, read from Meta at most every 5 minutes. Null: we can't tell (not connected). */
async function approvedTemplates(): Promise<Set<string> | null> {
  if (approved && Date.now() - approved.at < 5 * 60_000) return approved.names;
  const r = await fetchTemplates().catch(() => null);
  if (!r || !r.ok) return null;
  approved = { at: Date.now(), names: new Set(r.items.filter((t) => t.status === 'APPROVED').map((t) => t.name)) };
  return approved.names;
}

/** Why a WhatsApp to this person can't go, in words (the Site tab shows it), or null. */
export async function whatsappProblem(c: ContactRow, kind: MessageKind): Promise<string | null> {
  if (!c.wa_id) return 'No mobile, so it went by email.';
  if (!c.whatsapp_ok) return `${firstNameOf(c.name)} hasn’t said they’re happy to get job messages on WhatsApp, so it went by email.`;
  if (!whatsappConfigured()) return 'WhatsApp isn’t connected, so it went by email.';
  const names = await approvedTemplates();
  if (!names?.has(KIND_TEMPLATE[kind])) return `The ${KIND_TEMPLATE[kind]} WhatsApp template isn’t approved yet (WhatsApp templates), so it went by email.`;
  return null;
}

/* ── The queue ───────────────────────────────────────────────────────────────── */

export type Outgoing = {
  assignmentId: string;
  channel: 'email' | 'whatsapp';
  kind: MessageKind;
  dedupeKey: string;
  to: string;
  /** WhatsApp: the template and its blanks. Email: { subject, html, attach? }. */
  template?: string | null;
  params: Record<string, unknown> | string[];
  sendAfter: Date;
};

export type MessageRow = {
  id: string;
  assignment_id: string;
  channel: 'email' | 'whatsapp';
  kind: string;
  dedupe_key: string;
  to_address: string;
  template: string | null;
  params: unknown;
  status: string;
  send_after: string;
  sent_at: string | null;
  provider_id: string | null;
  error: string | null;
};

/**
 * Put a message on the queue (once per dedupe key) and send it now if it's due. A key used before
 * gives back the message it made, untouched: nothing is sent twice.
 */
export async function queueMessage(db: Db, m: Outgoing, actor: string): Promise<MessageRow | null> {
  const { data, error } = await db
    .from('site_messages')
    .insert({
      assignment_id: m.assignmentId,
      channel: m.channel,
      kind: m.kind,
      dedupe_key: m.dedupeKey,
      to_address: m.to,
      template: m.template ?? null,
      params: m.params,
      send_after: m.sendAfter.toISOString(),
    })
    .select('*')
    .single();
  if (error) {
    if (error.code !== '23505') return null;
    const { data: was } = await db.from('site_messages').select('*').eq('dedupe_key', m.dedupeKey).maybeSingle();
    return (was as MessageRow | null) ?? null;
  }
  const row = data as MessageRow;
  await logSiteEvent(db, m.assignmentId, actor, 'message_queued', { channel: m.channel, kind: m.kind, send_after: row.send_after });
  if (Date.parse(row.send_after) <= Date.now() + 1000) return (await deliver(db, row)) ?? row;
  return row;
}

/** Send one queued message now: claimed first, so two runs can't both send it. Never throws. */
export async function deliver(db: Db, m: MessageRow): Promise<MessageRow | null> {
  try {
    const lease = new Date(Date.now() + LEASE_MS).toISOString();
    const { data: claimed } = await db
      .from('site_messages')
      .update({ send_after: lease })
      .eq('id', m.id)
      .eq('status', 'queued')
      .lte('send_after', new Date(Date.now() + 1000).toISOString())
      .select('id');
    if (!claimed?.length) return null;
    let result: { ok: true; id: string | null } | { ok: false; error: string };
    if (m.channel === 'email') {
      const p = (m.params ?? {}) as { subject?: string; html?: string; attach?: { bucket: string; path: string; filename: string } };
      let attachments: { filename: string; content: Uint8Array; contentType: string }[] | undefined;
      if (p.attach) {
        const { data: blob } = await db.storage.from(p.attach.bucket).download(p.attach.path);
        if (!blob) throw new Error('The PDF to attach isn’t there yet.');
        attachments = [{ filename: p.attach.filename, content: new Uint8Array(await blob.arrayBuffer()), contentType: 'application/pdf' }];
      }
      result = await sendEmail({
        to: m.to_address,
        subject: String(p.subject ?? 'Heliaxis'),
        html: String(p.html ?? ''),
        from: FROM,
        replyTo: HELIAXIS_COMPANY.email,
        attachments,
        idempotencyKey: `site-${m.dedupe_key}`,
      });
    } else {
      const r = await sendTemplate(m.to_address, String(m.template), defaultTemplate().lang, (Array.isArray(m.params) ? m.params : []).map(String));
      result = r.ok ? { ok: true, id: r.data.messages?.[0]?.id ?? null } : { ok: false, error: r.error };
    }
    const now = new Date().toISOString();
    const u = result.ok ? { status: 'sent', sent_at: now, provider_id: result.id, error: null } : { status: 'failed', error: result.error.slice(0, 500) };
    const { data: done } = await db.from('site_messages').update(u).eq('id', m.id).select('*').single();
    await logSiteEvent(db, m.assignment_id, 'system', result.ok ? 'message_sent' : 'message_failed', { channel: m.channel, kind: m.kind, ...(result.ok ? {} : { error: result.error }) });
    // A labour PO counts as sent once it has actually reached them (po:<id>:v<n>:<channel>): the
    // first message to arrive sets when, and the email address says where (over a WhatsApp number).
    const po = m.kind === 'po' ? /^po:([0-9a-f-]{36}):/i.exec(m.dedupe_key)?.[1] : null;
    if (result.ok && po) {
      const { data: cur } = await db.from('purchase_orders').select('sent_at, sent_to').eq('id', po).maybeSingle();
      const was = (cur ?? {}) as { sent_at?: string | null; sent_to?: string | null };
      const to = m.channel === 'email' ? m.to_address : was.sent_to?.includes('@') ? was.sent_to : `WhatsApp ${m.to_address}`;
      await db
        .from('purchase_orders')
        .update({ status: 'sent', sent_at: was.sent_at ?? now, sent_to: to, updated_at: now })
        .eq('id', po)
        .in('status', ['draft', 'sent']);
    }
    // A return to site's written notice (return:<id>:<channel>): when it first reached them is kept with it.
    const ret = m.kind === 'return_to_site' ? /^return:([0-9a-f-]{36}):/i.exec(m.dedupe_key)?.[1] : null;
    if (result.ok && ret) await db.from('site_returns').update({ notice_sent_at: now }).eq('id', ret).is('notice_sent_at', null);
    return (done as MessageRow | null) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not sent';
    await db.from('site_messages').update({ status: 'failed', error: msg.slice(0, 500) }).eq('id', m.id).then(
      () => null,
      () => null
    );
    // Said as it is: it failed (a caller would otherwise report the row it queued as "waiting to send").
    return { ...m, status: 'failed', error: msg.slice(0, 500) };
  }
}

/**
 * Send a message that didn't go again (the office's "Send again"): the same row and the same dedupe
 * key, so the notice or PO stays as it was recorded and Resend's idempotency key stops a double if
 * the first try did reach them. A PO's message only for the version that's current, and a return to
 * site's notice only while it's still with them. Null when there's nothing to send again.
 */
export async function sendAgain(db: Db, id: string, assignmentId: string, actor: string): Promise<MessageRow | null> {
  const { data: m } = await db.from('site_messages').select('*').eq('id', id).eq('assignment_id', assignmentId).maybeSingle();
  const row = m as MessageRow | null;
  if (!row || row.status !== 'failed') return null;
  if (row.kind === 'po') {
    const [, poId, v] = /^po:([0-9a-f-]{36}):v(\d+):/i.exec(row.dedupe_key) ?? [];
    const { data: po } = poId ? await db.from('purchase_orders').select('status, labour').eq('id', poId).maybeSingle() : { data: null };
    const version = Number((po?.labour as { version?: number } | null)?.version ?? 0);
    if (!po || po.status === 'cancelled' || version !== Number(v)) return null;
  }
  if (row.kind === 'return_to_site') {
    const retId = /^return:([0-9a-f-]{36}):/i.exec(row.dedupe_key)?.[1];
    const { data: ret } = retId ? await db.from('site_returns').select('status').eq('id', retId).maybeSingle() : { data: null };
    if (!ret || ret.status !== 'open') return null;
  }
  const { data: back } = await db
    .from('site_messages')
    .update({ status: 'queued', send_after: new Date().toISOString(), error: null })
    .eq('id', row.id)
    .eq('status', 'failed')
    .select('*');
  const queued = ((back ?? []) as MessageRow[])[0];
  if (!queued) return null;
  await logSiteEvent(db, assignmentId, actor, 'message_resent', { channel: row.channel, kind: row.kind, error_was: row.error });
  return (await deliver(db, queued)) ?? queued;
}

/** /api/cron/site: send every message whose time has come. Returns how many went. */
export async function sendDue(db: Db, limit = 50): Promise<number> {
  const { data } = await db.from('site_messages').select('*').eq('status', 'queued').lte('send_after', new Date().toISOString()).order('send_after').limit(limit);
  let sent = 0;
  for (const m of (data ?? []) as MessageRow[]) if ((await deliver(db, m))?.status === 'sent') sent++;
  return sent;
}

/* ── Staff sends: the job pack, clear to start, don't use the scaffold ───────── */

export const emailHtml = (e: EmailText) =>
  emailShell(
    e.title,
    e.paragraphs.map((p) => `<p>${esc(p)}</p>`).join(''),
    e.cta,
    'Site'
  );

export type SendResult = {
  link: string;
  /** For "Copy link" and "WhatsApp from my phone". */
  chatText: string;
  waHref: string | null;
  messages: MessageRow[];
  /** Why a channel didn't go ("WhatsApp isn't connected, so it went by email"). */
  notes: string[];
};

/**
 * Send a trade their job pack (or, for the scaffold, "clear to start" / "don't use it yet") by email
 * and/or WhatsApp, held through the evening rule. `via: 'link'` only hands back the link and the
 * words for WhatsApp from my phone. The first time a link goes out, the assignment counts as sent.
 */
export async function sendToTrade(
  db: Db,
  a: AssignmentRow,
  c: ContactRow,
  opts: { kind: MessageKind; via: 'email' | 'whatsapp' | 'both' | 'link'; rotate?: boolean; actor: string; byId: string | null; now?: Date; origin?: string | null }
): Promise<SendResult> {
  const now = opts.now ?? new Date();
  const job = await jobOf(db, a.project_id);
  const { token, generation } = await ensureLink(db, a, opts.rotate);
  const link = siteLink(token, opts.origin);
  const about = aboutOf(a, c, job, link);
  const kind = opts.kind;
  const words = kind === 'clear_to_start' ? clearToStartText(about) : kind === 'scaffold_hold' ? scaffoldHoldText(about) : jobPackText(about);
  const out: SendResult = { link, chatText: words, waHref: c.wa_id ? clickToChat(c.wa_id, words) : null, messages: [], notes: [] };

  if (a.status === 'draft') {
    const at = now.toISOString();
    await db.from('site_assignments').update({ status: 'sent', sent_at: at, updated_at: at }).eq('id', a.id).eq('status', 'draft');
    a.status = 'sent';
    a.sent_at = at;
  }
  if (opts.rotate) await logSiteEvent(db, a.id, opts.actor, 'link_rotated', { generation });
  if (opts.via === 'link') {
    await logSiteEvent(db, a.id, opts.actor, 'link_copied', { generation });
    return out;
  }

  const after = sendAfter(now, await getWaSettings());
  // The same send tapped twice: the same keys, so one of each.
  const scope = kind === 'job_pack' ? `pack:${a.id}:${generation}` : `${kind === 'clear_to_start' ? 'clear' : 'hold'}:${a.id}:${ukDay(now)}`;
  const email = kind === 'clear_to_start' ? clearToStartEmail(about) : kind === 'scaffold_hold' ? scaffoldHoldEmail(about) : jobPackEmail({ ...about, days: a.days, note: a.note_to_trade });
  const params = kind === 'clear_to_start' ? clearToStartParams(about) : kind === 'scaffold_hold' ? scaffoldHoldParams(about) : jobPackParams(about);
  if (opts.via !== 'whatsapp') {
    if (c.email) {
      const m = await queueMessage(db, { assignmentId: a.id, channel: 'email', kind, dedupeKey: `${scope}:email`, to: c.email, params: { subject: email.subject, html: emailHtml(email) }, sendAfter: after }, opts.actor);
      if (m) out.messages.push(m);
    } else out.notes.push('No email address, so no email went.');
  }
  if (opts.via !== 'email') {
    const problem = await whatsappProblem(c, kind);
    if (problem) out.notes.push(problem);
    else {
      const m = await queueMessage(db, { assignmentId: a.id, channel: 'whatsapp', kind, dedupeKey: `${scope}:whatsapp`, to: c.wa_id!, template: KIND_TEMPLATE[kind], params, sendAfter: after }, opts.actor);
      if (m) out.messages.push(m);
    }
  }
  const label = kind === 'job_pack' ? 'Job pack' : kind === 'clear_to_start' ? '“Clear to start”' : '“Don’t use the scaffold yet”';
  const held = out.messages.some((m) => m.status === 'queued');
  await logJob(
    db,
    a.project_id,
    `${label} ${held ? 'queued' : 'sent'} to ${c.name} (${a.trade === 'other' ? a.trade_label || 'trade' : TRADE_LABEL[a.trade].toLowerCase()})${out.messages.length ? ` by ${[...new Set(out.messages.map((m) => (m.channel === 'email' ? 'email' : 'WhatsApp')))].join(' and ')}` : ''}`,
    { assignment: a.id, kind },
    opts.byId
  );
  return out;
}

/** The strike photos request and its reminders (1H): one per working day number, never twice. */
export async function sendStrikeRequest(db: Db, a: AssignmentRow, c: ContactRow, n: number, now = new Date(), origin?: string | null): Promise<MessageRow[]> {
  const job = await jobOf(db, a.project_id);
  const { token } = await ensureLink(db, a);
  const about = aboutOf(a, c, job, siteLink(token, origin));
  const after = sendAfter(now, await getWaSettings());
  const out: MessageRow[] = [];
  if (c.email) {
    const e = strikeEmail(about);
    const m = await queueMessage(db, { assignmentId: a.id, channel: 'email', kind: 'strike', dedupeKey: `strike:${a.id}:${n}:email`, to: c.email, params: { subject: e.subject, html: emailHtml(e) }, sendAfter: after }, 'system');
    if (m) out.push(m);
  }
  if (!(await whatsappProblem(c, 'strike'))) {
    const m = await queueMessage(db, { assignmentId: a.id, channel: 'whatsapp', kind: 'strike', dedupeKey: `strike:${a.id}:${n}:whatsapp`, to: c.wa_id!, template: KIND_TEMPLATE.strike, params: strikeParams(about), sendAfter: after }, 'system');
    if (m) out.push(m);
  }
  return out;
}
