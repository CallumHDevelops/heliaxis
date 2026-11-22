import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { msConfigured } from '@/lib/ms365';
import { draftForThread, nameDomains, triageThread, type ThreadForAi } from './ai';
import { ensureFolder, getParentFolder, inboxId, listFolder, messageText, moveMessage, type GMessage } from './graph';
import {
  addressOf,
  companyDomain,
  domainFromText,
  domainOf,
  folderFor,
  groupForOrgType,
  guessLabel,
  isPersonalDomain,
  looksAutomated,
  looksLikeMarketing,
  MARKETING_FOLDER,
  readyToFile,
  threadState,
  type ThreadState,
} from './shared';

/**
 * My email, the job (every two minutes, /api/cron/mail). For each connected mailbox:
 *  1. Reads new emails (inbox and sent), and on the first runs works back through the whole inbox and the last six
 *     months of sent emails, a page at a time.
 *  2. Matches each person to a folder rule: a CRM customer by their address (Customers/Jane Smith), an organisation
 *     or a company by its domain (Suppliers/GoodWe). Companies not in the CRM get a suggested rule, named by the
 *     writing assistant, that waits for the mailbox's owner to approve it in Email › Folders.
 *  3. Works out, for each conversation, whether it needs a reply and how much it matters, and drafts the reply.
 *  4. Once filing is on, moves the emails of dealt-with conversations into their folders, and marketing into
 *     Marketing (once that is on). Nothing is ever deleted.
 * Each step stops when the time is up and carries on next run.
 */

type Db = ReturnType<typeof createAdminClient>;
type Box = {
  id: string;
  user_id: string;
  address: string;
  filing: boolean;
  marketing: boolean;
  drafts: boolean;
  scan_before: string | null;
  sent_before: string | null;
  live_since: string | null;
};
type Rule = {
  id: string;
  kind: 'domain' | 'address';
  match: string;
  label: string;
  folder: string;
  action: 'file' | 'marketing' | 'leave';
  status: 'suggested' | 'on' | 'off';
  never_marketing: boolean;
  enquiry_id: string | null;
  organisation_id: string | null;
  contact_id: string | null;
};
type Org = { id: string; name: string; type: string | null };

const SENT_HISTORY_DAYS = 180;
const TRIAGE_DAYS = 21;
const PAGES_PER_RUN = 6;
const TRIAGE_PER_RUN = 8;
const DRAFTS_PER_RUN = 3;
const MOVES_PER_RUN = 50;

const RULE_COLS = 'id, kind, match, label, folder, action, status, never_marketing, enquiry_id, organisation_id, contact_id';

export type BoxResult = { address: string; read: number; named: number; triaged: number; drafted: number; filed: number; marketing: number; error?: string };

export async function runMailSort(o: { until: number }): Promise<BoxResult[]> {
  if (!msConfigured()) return [];
  const db = createAdminClient();
  const { data: boxes, error } = await db.from('mail_boxes').select('id, user_id, address, filing, marketing, drafts, scan_before, sent_before, live_since').order('created_at');
  if (error || !boxes?.length) return [];
  const out: BoxResult[] = [];
  for (const b of boxes as Box[]) {
    if (Date.now() > o.until) break;
    out.push(await runBox(db, b, o.until));
  }
  return out;
}

/** One mailbox, start to finish. Never throws: the error is saved on the mailbox for Email › Settings. */
export async function runBox(db: Db, box: Box, until: number): Promise<BoxResult> {
  const res: BoxResult = { address: box.address, read: 0, named: 0, triaged: 0, drafted: 0, filed: 0, marketing: 0 };
  const started = new Date().toISOString();
  try {
    const ctx = await Context.load(db, box);
    res.read = await readMail(ctx, until);
    if (Date.now() < until) res.named = await nameNewCompanies(ctx);
    if (Date.now() < until) res.triaged = await triage(ctx, until);
    if (box.drafts && Date.now() < until) res.drafted = await draftReplies(ctx, until);
    if ((box.filing || box.marketing) && Date.now() < until) Object.assign(res, await fileMail(ctx, until));
    await db.from('mail_boxes').update({ last_run_at: started, last_error: null }).eq('id', box.id);
  } catch (e) {
    res.error = e instanceof Error ? e.message : 'failed';
    await db.from('mail_boxes').update({ last_run_at: started, last_error: res.error.slice(0, 500) }).eq('id', box.id);
  }
  return res;
}

/* ── What the run knows: the rules, the CRM's organisations, the owner's name ── */

export class Context {
  rules = new Map<string, Rule>();
  byId = new Map<string, Rule>();
  orgByDomain = new Map<string, Org>();
  folders = new Map<string, string>();
  ownDomain: string;
  owner = '';
  private crmCache = new Map<string, Rule | null>();
  touchedConversations = new Set<string>();

  private constructor(
    public db: Db,
    public box: Box
  ) {
    this.ownDomain = companyDomain(domainOf(box.address));
  }

  static async load(db: Db, box: Box) {
    const c = new Context(db, box);
    const [rules, { data: orgs }, { data: folders }, { data: me }] = await Promise.all([
      allRules(db, box.id),
      db.from('organisations').select('id, name, type, email, website'),
      db.from('mail_folders').select('path, graph_id').eq('box_id', box.id),
      db.from('profiles').select('full_name, email').eq('id', box.user_id).maybeSingle(),
    ]);
    for (const r of rules) c.remember(r);
    for (const o of orgs ?? []) {
      for (const d of [domainFromText(o.email as string | null), domainFromText(o.website as string | null)]) {
        if (d && !isPersonalDomain(d) && !c.orgByDomain.has(d)) c.orgByDomain.set(d, { id: o.id as string, name: o.name as string, type: (o.type as string | null) ?? null });
      }
    }
    for (const f of folders ?? []) c.folders.set(f.path as string, f.graph_id as string);
    c.owner = String(me?.full_name || me?.email || '').split(/[\s@]/)[0] || 'Callum';
    return c;
  }

  remember(r: Rule) {
    this.rules.set(`${r.kind}:${r.match}`, r);
    this.byId.set(r.id, r);
  }

  /** The rule for someone, made if there isn't one yet. Null for a stranger on Gmail and the like. */
  async ruleFor(address: string, name: string | null): Promise<Rule | null> {
    const a = addressOf(address);
    if (!a || !a.includes('@') || a === addressOf(this.box.address)) return null;
    const own = this.rules.get(`address:${a}`);
    if (own) return own;
    const dom = companyDomain(domainOf(a));
    const personal = isPersonalDomain(dom);
    if (!personal) {
      const d = this.rules.get(`domain:${dom}`);
      if (d) return d;
    }
    if (this.crmCache.has(a)) return this.crmCache.get(a) ?? null;
    const made = await this.makeRule(a, dom, personal, name);
    this.crmCache.set(a, made);
    return made;
  }

  private async makeRule(a: string, dom: string, personal: boolean, name: string | null): Promise<Rule | null> {
    const db = this.db;
    // A customer in the CRM: their own folder, on straight away.
    const { data: enq } = await db.from('enquiries').select('id, name').ilike('email', a).order('created_at', { ascending: false }).limit(1);
    if (enq?.[0]) {
      const label = String(enq[0].name || name || a);
      return this.insert({ kind: 'address', match: a, label, folder: folderFor('Customers', label), status: 'on', source: 'crm', named: true, enquiry_id: enq[0].id as string });
    }
    // A contact in the CRM: their organisation's folder (by domain), or their own.
    const { data: con } = await db.from('crm_contacts').select('id, name, organisation_id').ilike('email', a).limit(1);
    if (con?.[0]) {
      const orgId = con[0].organisation_id as string | null;
      const { data: org } = orgId ? await db.from('organisations').select('id, name, type').eq('id', orgId).maybeSingle() : { data: null };
      if (org && !personal) {
        return this.insert({ kind: 'domain', match: dom, label: org.name as string, folder: folderFor(groupForOrgType(org.type as string), org.name as string), status: 'on', source: 'crm', named: true, organisation_id: org.id as string });
      }
      const label = String(con[0].name || name || a);
      return this.insert({ kind: 'address', match: a, label, folder: folderFor(org ? groupForOrgType(org.type as string) : 'Other', org ? (org.name as string) : label), status: 'on', source: 'crm', named: true, contact_id: con[0].id as string, organisation_id: org?.id ?? null });
    }
    if (personal) return null;
    // An organisation in the CRM with this domain.
    const org = this.orgByDomain.get(dom);
    if (org) return this.insert({ kind: 'domain', match: dom, label: org.name, folder: folderFor(groupForOrgType(org.type), org.name), status: 'on', source: 'crm', named: true, organisation_id: org.id });
    // The team.
    if (dom === this.ownDomain) return this.insert({ kind: 'domain', match: dom, label: 'Heliaxis team', folder: 'Team', status: 'suggested', source: 'scan', named: true });
    // A company we don't know yet: suggested, to be named and approved.
    const label = guessLabel(dom);
    return this.insert({ kind: 'domain', match: dom, label, folder: folderFor('Other', label), status: 'suggested', source: 'scan', named: false });
  }

  private async insert(r: Partial<Rule> & { kind: Rule['kind']; match: string; label: string; folder: string; status: Rule['status']; source: string; named: boolean }): Promise<Rule> {
    const row = { box_id: this.box.id, action: 'file', ...r };
    // Never over one that's already there (yours to change): if it exists, that one is used.
    const { data, error } = await this.db.from('mail_rules').upsert(row, { onConflict: 'box_id,kind,match', ignoreDuplicates: true }).select(RULE_COLS);
    if (error) throw new Error(error.message);
    let rule = (data?.[0] as Rule | undefined) ?? null;
    if (!rule) {
      const { data: had } = await this.db.from('mail_rules').select(RULE_COLS).eq('box_id', this.box.id).eq('kind', r.kind).eq('match', r.match).maybeSingle();
      rule = (had as Rule | null) ?? null;
    }
    if (!rule) throw new Error('Couldn’t save a folder rule');
    this.remember(rule);
    return rule;
  }
}

/* ── 1. Reading ─────────────────────────────────────────────────────────────── */

async function readMail(ctx: Context, until: number): Promise<number> {
  const { db, box } = ctx;
  const startedAt = new Date().toISOString();
  let read = 0;
  // New since the last run (five minutes' overlap: an email can arrive with an earlier time than the last read).
  const since = new Date(Date.parse(box.live_since ?? startedAt) - 5 * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
  for (const [folder, direction] of [['inbox', 'in'], ['sentitems', 'out']] as const) {
    // A busy few minutes: keep going back a page at a time until the page isn't full.
    let page = await listFolder(box.address, folder, { since });
    for (let i = 0; i < 5; i++) {
      read += await ingest(ctx, page, direction);
      const oldest = page.at(-1);
      const at = oldest && (direction === 'in' ? oldest.receivedDateTime : oldest.sentDateTime);
      if (page.length < 50 || !at) break;
      page = await listFolder(box.address, folder, { since, before: at });
    }
  }
  await db.from('mail_boxes').update({ live_since: startedAt }).eq('id', box.id);

  // The first read, working back a page at a time: the whole inbox, and six months of sent emails.
  let pages = 0;
  let scanBefore = box.scan_before;
  let sentBefore = box.sent_before;
  const sentFloor = Date.now() - SENT_HISTORY_DAYS * 86_400_000;
  while (pages < PAGES_PER_RUN && Date.now() < until - 15_000 && (scanBefore || sentBefore)) {
    pages++;
    if (sentBefore) {
      const page = await listFolder(box.address, 'sentitems', { before: sentBefore });
      read += await ingest(ctx, page, 'out');
      const oldest = page.at(-1)?.sentDateTime;
      sentBefore = page.length && oldest && Date.parse(oldest) > sentFloor ? oldest : null;
    } else if (scanBefore) {
      const page = await listFolder(box.address, 'inbox', { before: scanBefore });
      read += await ingest(ctx, page, 'in');
      scanBefore = page.length ? (page.at(-1)?.receivedDateTime ?? null) : null;
    }
    await db
      .from('mail_boxes')
      .update({ scan_before: scanBefore, sent_before: sentBefore, ...(scanBefore || sentBefore ? {} : { scan_done_at: new Date().toISOString() }) })
      .eq('id', box.id);
  }
  ctx.box.scan_before = scanBefore;
  ctx.box.sent_before = sentBefore;
  await refreshThreads(ctx);
  return read;
}

/** Saves a page of emails (ones already saved are skipped), with their rule, and logs customers' emails on the CRM timeline. */
async function ingest(ctx: Context, page: GMessage[], direction: 'in' | 'out'): Promise<number> {
  if (!page.length) return 0;
  const { db, box } = ctx;
  const me = addressOf(box.address);
  const rows = [];
  for (const m of page) {
    const from = addressOf(m.from?.emailAddress?.address);
    const to = [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].map((r) => addressOf(r.emailAddress?.address)).filter(Boolean);
    const other = direction === 'in' ? from : to.find((a) => a !== me);
    if (!other || !m.conversationId) continue;
    // Sent to yourself, or to the team only: kept, but with no rule.
    const rule = await ctx.ruleFor(other, direction === 'in' ? (m.from?.emailAddress?.name ?? null) : (m.toRecipients?.[0]?.emailAddress?.name ?? null));
    const at = (direction === 'in' ? m.receivedDateTime : m.sentDateTime) || new Date().toISOString();
    rows.push({
      box_id: box.id,
      graph_id: m.id,
      internet_id: m.internetMessageId ?? null,
      conversation_id: m.conversationId,
      direction,
      from_address: from || null,
      from_name: m.from?.emailAddress?.name ?? null,
      to_addresses: to.slice(0, 20),
      subject: m.subject ?? null,
      preview: (m.bodyPreview ?? '').slice(0, 300),
      at,
      marketing: direction === 'in' && looksLikeMarketing(m.internetMessageHeaders) && !rule?.never_marketing && !rule?.enquiry_id,
      automated: direction === 'in' && looksAutomated(from, m.internetMessageHeaders),
      rule_id: rule?.id ?? null,
      place: direction === 'in' ? 'inbox' : 'sent',
      _enquiry: rule?.enquiry_id ?? null,
      _other: other,
    });
  }
  if (!rows.length) return 0;
  const { data: added, error } = await db
    .from('mail_messages')
    .upsert(
      rows.map(({ _enquiry, _other, ...r }) => r), // eslint-disable-line @typescript-eslint/no-unused-vars
      { onConflict: 'box_id,graph_id', ignoreDuplicates: true }
    )
    .select('graph_id, rule_id, at');
  if (error) throw new Error(error.message);
  for (const r of rows) ctx.touchedConversations.add(r.conversation_id);

  // Each rule's count and latest email, for Email › Folders.
  const perRule = new Map<string, { n: number; last: string }>();
  for (const a of added ?? []) {
    if (!a.rule_id) continue;
    const p = perRule.get(a.rule_id as string) ?? { n: 0, last: a.at as string };
    p.n++;
    if (String(a.at) > p.last) p.last = a.at as string;
    perRule.set(a.rule_id as string, p);
  }
  for (const [id, p] of perRule) {
    const { data: cur } = await db.from('mail_rules').select('messages, last_at').eq('id', id).maybeSingle();
    await db
      .from('mail_rules')
      .update({ messages: Number(cur?.messages ?? 0) + p.n, last_at: !cur?.last_at || p.last > String(cur.last_at) ? p.last : cur.last_at })
      .eq('id', id);
  }

  // Customers' emails go on their CRM timeline too (once: crm_emails.graph_id is unique).
  const newIds = new Set((added ?? []).map((a) => a.graph_id as string));
  const crm = rows.filter((r) => r._enquiry && r.internet_id && newIds.has(r.graph_id));
  if (crm.length) {
    await db.from('crm_emails').upsert(
      crm.map((r) => ({
        enquiry_id: r._enquiry,
        graph_id: r.internet_id,
        direction,
        subject: r.subject,
        body: r.preview,
        from_address: direction === 'in' ? r._other : box.address,
        to_address: direction === 'in' ? box.address : r._other,
        at: r.at,
      })),
      { onConflict: 'graph_id', ignoreDuplicates: true }
    );
  }
  return added?.length ?? 0;
}

/** Brings each touched conversation's row up to date from its emails. */
async function refreshThreads(ctx: Context) {
  const { db, box } = ctx;
  const ids = [...ctx.touchedConversations];
  ctx.touchedConversations.clear();
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const [{ data: msgs }, { data: existing }] = await Promise.all([
      db.from('mail_messages').select('graph_id, conversation_id, direction, from_address, from_name, to_addresses, subject, at, marketing, automated, rule_id').eq('box_id', box.id).in('conversation_id', chunk).order('at'),
      db.from('mail_threads').select('conversation_id, needs_reply, triaged_for, done_at, enquiry_id').eq('box_id', box.id).in('conversation_id', chunk),
    ]);
    const prior = new Map((existing ?? []).map((t) => [t.conversation_id as string, t]));
    const rows = chunk.map((cid) => {
      const list = (msgs ?? []).filter((m) => m.conversation_id === cid);
      const ins = list.filter((m) => m.direction === 'in');
      const outs = list.filter((m) => m.direction === 'out');
      const lastIn = ins.at(-1);
      const lastOut = outs.at(-1);
      const last = list.at(-1);
      const ruleId = (lastIn?.rule_id ?? last?.rule_id ?? null) as string | null;
      const rule = ruleId ? ctx.byId.get(ruleId) : undefined;
      const p = prior.get(cid);
      const marketing = ins.length > 0 && ins.every((m) => m.marketing) && !outs.length;
      const state: ThreadState = threadState({
        marketing,
        lastInAt: (lastIn?.at as string) ?? null,
        lastOutAt: (lastOut?.at as string) ?? null,
        doneAt: (p?.done_at as string) ?? null,
        triagedFor: (p?.triaged_for as string) ?? null,
        needsReply: (p?.needs_reply as boolean | null) ?? null,
      });
      return {
        box_id: box.id,
        conversation_id: cid,
        subject: (last?.subject as string) ?? null,
        who_address: (lastIn?.from_address as string) ?? ((lastOut?.to_addresses as string[] | null)?.[0] ?? null),
        who_name: (lastIn?.from_name as string) ?? rule?.label ?? null,
        rule_id: ruleId,
        enquiry_id: rule?.enquiry_id ?? (p?.enquiry_id as string | null) ?? null,
        organisation_id: rule?.organisation_id ?? null,
        contact_id: rule?.contact_id ?? null,
        messages: list.length,
        last_in_at: (lastIn?.at as string) ?? null,
        last_out_at: (lastOut?.at as string) ?? null,
        last_in_graph_id: (lastIn?.graph_id as string) ?? null,
        marketing,
        automated: !!lastIn?.automated,
        state,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await db.from('mail_threads').upsert(rows, { onConflict: 'box_id,conversation_id' });
    if (error) throw new Error(error.message);
  }
}

/* ── 2. Naming the companies ─────────────────────────────────────────────── */

async function nameNewCompanies(ctx: Context): Promise<number> {
  const { db, box } = ctx;
  const { data: rules } = await db.from('mail_rules').select('id, match').eq('box_id', box.id).eq('kind', 'domain').eq('named', false).order('messages', { ascending: false }).limit(30);
  if (!rules?.length) return 0;
  const samples = [];
  for (const r of rules) {
    const { data: msgs } = await db.from('mail_messages').select('from_name, subject').eq('rule_id', r.id).eq('direction', 'in').order('at', { ascending: false }).limit(6);
    samples.push({
      domain: r.match as string,
      names: [...new Set((msgs ?? []).map((m) => String(m.from_name || '')).filter(Boolean))],
      subjects: [...new Set((msgs ?? []).map((m) => String(m.subject || '')).filter(Boolean))],
    });
  }
  const named = await nameDomains(samples);
  if (!named.length) return 0;
  let n = 0;
  for (const r of rules) {
    const hit = named.find((x) => x.domain.toLowerCase() === String(r.match));
    if (!hit) {
      // Left out of the answer: keep the tidied domain as its name rather than ask again every run.
      await db.from('mail_rules').update({ named: true }).eq('id', r.id).eq('named', false);
      continue;
    }
    const marketingOnly = hit.marketing_only;
    await db
      .from('mail_rules')
      .update({
        label: hit.name || guessLabel(r.match as string),
        folder: marketingOnly ? MARKETING_FOLDER : folderFor(hit.group, hit.name || guessLabel(r.match as string)),
        action: marketingOnly ? 'marketing' : 'file',
        named: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', r.id)
      .eq('named', false); // not if you renamed it meanwhile
    n++;
  }
  return n;
}

/* ── 3. Needs a reply? And the draft ─────────────────────────────────────── */

/** The conversation as the writing assistant sees it: the latest email from them in full, the rest as previews. */
async function threadForAi(ctx: Context, t: { conversation_id: string; subject: string | null; who_name: string | null; who_address: string | null; enquiry_id: string | null; rule_id: string | null; last_in_graph_id: string | null }): Promise<ThreadForAi> {
  const { db, box } = ctx;
  const { data: msgs } = await db.from('mail_messages').select('graph_id, direction, at, preview').eq('box_id', box.id).eq('conversation_id', t.conversation_id).order('at').limit(40);
  const list = (msgs ?? []).slice(-5);
  const messages: ThreadForAi['messages'] = [];
  for (const m of list) {
    let text = String(m.preview || '');
    // The full text of the latest email from them, and of the last thing you sent (for the tone).
    if (m.graph_id === t.last_in_graph_id || m === list.filter((x) => x.direction === 'out').at(-1)) {
      text = await messageText(box.address, m.graph_id as string).then((r) => r.text || text).catch(() => text);
    }
    messages.push({ from: m.direction === 'in' ? 'them' : 'me', at: String(m.at), text });
  }
  return { subject: t.subject || '(no subject)', who: [t.who_name, t.who_address].filter(Boolean).join(' '), inCrm: await crmLine(ctx, t), messages };
}

/** One line about who they are in the CRM, for the writing assistant. */
async function crmLine(ctx: Context, t: { enquiry_id: string | null; rule_id: string | null }): Promise<string | null> {
  const { db } = ctx;
  if (t.enquiry_id) {
    const [{ data: c }, { data: jobs }] = await Promise.all([
      db.from('enquiries').select('name, postcode').eq('id', t.enquiry_id).maybeSingle(),
      db.from('crm_projects').select('title, stage, next_step').eq('enquiry_id', t.enquiry_id).order('created_at', { ascending: false }).limit(3),
    ]);
    if (c) {
      const j = (jobs ?? []).map((p) => `${p.title || 'Job'} (stage: ${p.stage}${p.next_step ? `, next step: ${p.next_step}` : ''})`).join('; ');
      return `Customer in the CRM: ${c.name}${c.postcode ? `, ${c.postcode}` : ''}.${j ? ` Jobs: ${j}.` : ' No job yet.'}`;
    }
  }
  const rule = t.rule_id ? ctx.byId.get(t.rule_id) : undefined;
  if (rule?.organisation_id) return `Organisation in the CRM: ${rule.label} (folder ${rule.folder}).`;
  if (rule) return `From ${rule.label} (folder ${rule.folder}), not in the CRM.`;
  return null;
}

const THREAD_COLS = 'id, conversation_id, subject, who_name, who_address, enquiry_id, rule_id, last_in_at, last_in_graph_id, last_out_at, done_at, marketing, automated';

async function triage(ctx: Context, until: number): Promise<number> {
  const { db, box } = ctx;
  const cutoff = new Date(Date.now() - TRIAGE_DAYS * 86_400_000).toISOString();
  // Older conversations, and system emails: no reply needed, no assistant needed.
  await db
    .from('mail_threads')
    .update({ needs_reply: false, state: 'fyi', triaged_for: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('box_id', box.id)
    .eq('state', 'new')
    .or(`last_in_at.lt.${cutoff},automated.eq.true`);
  const { data: todo } = await db.from('mail_threads').select(THREAD_COLS).eq('box_id', box.id).eq('state', 'new').order('last_in_at', { ascending: false }).limit(TRIAGE_PER_RUN);
  let n = 0;
  for (const t of todo ?? []) {
    if (Date.now() > until - 8_000) break;
    const thread = await threadForAi(ctx, t as never);
    const r = await triageThread(thread, ctx.owner);
    if (!r) {
      // The assistant couldn't sort it (or isn't set up): it goes on To reply unsorted, so nothing is missed.
      await db
        .from('mail_threads')
        .update({ needs_reply: true, priority: null, summary: null, why: 'Not sorted automatically: have a look.', triaged_for: t.last_in_at, state: threadState({ marketing: !!t.marketing, lastInAt: t.last_in_at, lastOutAt: t.last_out_at, doneAt: t.done_at, triagedFor: t.last_in_at, needsReply: true }), updated_at: new Date().toISOString() })
        .eq('id', t.id);
      continue;
    }
    const needsReply = r.needs_reply && !r.injection_suspected;
    const prospect = r.kind === 'prospect' && !t.enquiry_id ? { name: r.prospect_name || t.who_name || '', phone: r.prospect_phone || '', postcode: r.prospect_postcode || '' } : null;
    await db
      .from('mail_threads')
      .update({
        needs_reply: needsReply,
        priority: r.priority,
        kind: r.kind,
        summary: r.summary || null,
        why: r.why || null,
        due: r.due || null,
        prospect,
        triaged_for: t.last_in_at,
        state: threadState({ marketing: !!t.marketing, lastInAt: t.last_in_at, lastOutAt: t.last_out_at, doneAt: t.done_at, triagedFor: t.last_in_at, needsReply }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', t.id);
    n++;
  }
  return n;
}

async function draftReplies(ctx: Context, until: number): Promise<number> {
  const { db, box } = ctx;
  const { data: todo } = await db.from('mail_threads').select(`${THREAD_COLS}, draft_for, priority`).eq('box_id', box.id).eq('state', 'reply').order('last_in_at', { ascending: false }).limit(30);
  const need = (todo ?? []).filter((t) => !t.draft_for || String(t.draft_for) < String(t.last_in_at));
  // The most important first.
  need.sort((a, b) => ['urgent', 'high', 'normal', 'low'].indexOf(String(a.priority)) - ['urgent', 'high', 'normal', 'low'].indexOf(String(b.priority)));
  let n = 0;
  for (const t of need.slice(0, DRAFTS_PER_RUN)) {
    if (Date.now() > until - 15_000) break;
    const ok = await writeDraft(ctx, t as never);
    if (ok) n++;
  }
  return n;
}

/** Writes (or rewrites, with your steer) one conversation's draft. */
export async function writeDraft(ctx: Context, t: { id: string; conversation_id: string; subject: string | null; who_name: string | null; who_address: string | null; enquiry_id: string | null; rule_id: string | null; last_in_at: string | null; last_in_graph_id: string | null }, steer?: string): Promise<string | null> {
  const thread = await threadForAi(ctx, t);
  const draft = await draftForThread(thread, ctx.owner, steer);
  await ctx.db
    .from('mail_threads')
    .update(draft ? { draft, draft_for: t.last_in_at, draft_error: null } : { draft_error: 'The writing assistant couldn’t write this one. Try again, or write it yourself.', draft_for: t.last_in_at })
    .eq('id', t.id);
  return draft;
}

/** For the API: the run's context for one mailbox (to rewrite a draft on request). */
export async function contextFor(db: Db, boxId: string) {
  const { data: box } = await db.from('mail_boxes').select('id, user_id, address, filing, marketing, drafts, scan_before, sent_before, live_since').eq('id', boxId).maybeSingle();
  return box ? Context.load(db, box as Box) : null;
}

/* ── 4. Filing ─────────────────────────────────────────────────────────── */

async function fileMail(ctx: Context, until: number): Promise<{ filed: number; marketing: number }> {
  const { db, box } = ctx;
  type Cand = { id: string; graph_id: string; conversation_id: string; at: string; marketing: boolean; rule: { folder: string; status: string; action: string; never_marketing: boolean } | null };
  const cols = 'id, graph_id, conversation_id, at, marketing, rule:mail_rules!inner(folder, status, action, never_marketing)';
  // Only emails that could move: an approved folder (filing on), or marketing (marketing on). Oldest first.
  const [toFile, toMarket, toMarketByRule] = await Promise.all([
    box.filing
      ? db.from('mail_messages').select(cols).eq('box_id', box.id).eq('place', 'inbox').eq('direction', 'in').eq('rule.status', 'on').eq('rule.action', 'file').order('at').limit(500)
      : Promise.resolve({ data: [] }),
    box.marketing
      ? db.from('mail_messages').select('id, graph_id, conversation_id, at, marketing, rule:mail_rules(folder, status, action, never_marketing)').eq('box_id', box.id).eq('place', 'inbox').eq('direction', 'in').eq('marketing', true).order('at').limit(200)
      : Promise.resolve({ data: [] }),
    box.marketing
      ? db.from('mail_messages').select(cols).eq('box_id', box.id).eq('place', 'inbox').eq('direction', 'in').eq('rule.status', 'on').eq('rule.action', 'marketing').order('at').limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  const one = (r: unknown) => (Array.isArray(r) ? (r[0] ?? null) : r) as Cand['rule'];
  const seen = new Set<string>();
  const cands: (Cand & { dest: 'file' | 'marketing' })[] = [];
  for (const [list, dest] of [[toMarket.data, 'marketing'], [toMarketByRule.data, 'marketing'], [toFile.data, 'file']] as const) {
    for (const m of (list ?? []) as unknown as Cand[]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      cands.push({ ...m, rule: one(m.rule), dest });
    }
  }
  if (!cands.length) return { filed: 0, marketing: 0 };
  const convs = [...new Set(cands.map((m) => m.conversation_id))];
  const states = new Map<string, { state: ThreadState; replied: boolean }>();
  for (let i = 0; i < convs.length; i += 25) {
    const { data } = await db.from('mail_threads').select('conversation_id, state, last_out_at').eq('box_id', box.id).in('conversation_id', convs.slice(i, i + 25));
    for (const t of data ?? []) states.set(t.conversation_id as string, { state: t.state as ThreadState, replied: !!t.last_out_at });
  }
  const inbox = await inboxId(box.address);
  let filed = 0;
  let marketing = 0;
  let moves = 0;
  for (const m of cands) {
    if (moves >= MOVES_PER_RUN || Date.now() > until - 5_000) break;
    const t = states.get(m.conversation_id);
    let dest: string | null = null;
    if (m.dest === 'marketing') {
      // Never from anyone you've written to, or anyone you've said isn't marketing.
      if (!m.rule?.never_marketing && !t?.replied) dest = MARKETING_FOLDER;
    } else if (m.rule && t && readyToFile(t.state, m.at)) {
      dest = m.rule.folder;
    }
    if (!dest) continue;
    moves++;
    try {
      // Only from the inbox: if you've already moved it somewhere yourself, it stays where you put it.
      const parent = await getParentFolder(box.address, m.graph_id);
      if (parent !== inbox) {
        await db.from('mail_messages').update({ place: 'elsewhere' }).eq('id', m.id);
        continue;
      }
      const before = ctx.folders.size;
      const folderId = await ensureFolder(box.address, dest, ctx.folders);
      if (ctx.folders.size !== before) await saveFolders(ctx);
      await moveMessage(box.address, m.graph_id, folderId);
      const kind = dest === MARKETING_FOLDER && m.dest === 'marketing' ? 'marketing' : 'filed';
      await db.from('mail_messages').update({ place: kind, filed_at: new Date().toISOString(), file_error: null }).eq('id', m.id);
      if (kind === 'filed') filed++;
      else marketing++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      // Gone (deleted in Outlook): stop trying.
      await db.from('mail_messages').update(/not found|ErrorItemNotFound/i.test(msg) ? { place: 'elsewhere', file_error: msg.slice(0, 300) } : { file_error: msg.slice(0, 300) }).eq('id', m.id);
    }
  }
  return { filed, marketing };
}

async function saveFolders(ctx: Context) {
  const rows = [...ctx.folders].map(([path, graph_id]) => ({ box_id: ctx.box.id, path, graph_id }));
  if (rows.length) await ctx.db.from('mail_folders').upsert(rows, { onConflict: 'box_id,path', ignoreDuplicates: true });
}

/** Every rule for a mailbox (a page of 1000 at a time: the database hands back no more in one go). */
async function allRules(db: Db, boxId: string): Promise<Rule[]> {
  const out: Rule[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('mail_rules').select(RULE_COLS).eq('box_id', boxId).order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Rule[]));
    if (!data || data.length < 1000) return out;
  }
}
