import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { looksLikeRef, refMatches, refOnly, refPatterns } from '@/lib/projects/refs';
import { scheduledAnswers } from '@/lib/whatsapp/schedule';
import { SERVICE_WINDOW_MS } from '@/lib/whatsapp/shared';
import type { ActiveChat, ActiveCounts } from '@/components/admin/whatsapp/dock-shared';

/**
 * The WhatsApp dock's chat list (GET /api/whatsapp/active): one row per WhatsApp number that's been
 * busy lately, with the person's latest open opportunity. "All chats" and the search box reach every
 * chat with any history, imported ones too. Read-only: it never sends what's queued and never clears
 * anything as read (the chat itself does that, only while it's on screen).
 *
 * Scopes: 'all' for Enquiries staff (every chat); 'linked' for CRM staff without Enquiries, who see
 * only numbers with an opportunity in the CRM.
 */

type Db = ReturnType<typeof createAdminClient>;
export type ChatScope = 'all' | 'linked';

/** A chat counts as active this long after its last message (or while unread, or inside the 24h window). */
const ACTIVE_DAYS = 14;
const BATCH = 100;
const ENQ_COLS = 'id, name, phone, postcode, wa_id, wa_unread, wa_last_inbound_at, wa_last_message_at';
const PROJ_COLS = 'id, enquiry_id, title, stage, created_at';
const CLOSED = new Set(['complete', 'lost']);

type Enq = {
  id: string;
  name: string | null;
  phone: string | null;
  postcode: string | null;
  wa_id: string | null;
  wa_unread: number | null;
  wa_last_inbound_at: string | null;
  wa_last_message_at: string | null;
  customer_ref?: string | null;
};
type Proj = { id: string; enquiry_id: string; title: string | null; stage: string; created_at: string; project_ref?: string | null };
type Pending = { enquiry_id: string; kind: string; send_after: string; created_at: string };
type PgError = { code?: string; message?: string } | null;
type Rows<T> = { data: T[] | null; error: PgError };
/** A row before its last-message preview is read. */
type Draft = Omit<ActiveChat, 'last' | 'chatHref'> & { lastAt: string | null; lastInbound: string | null };

const chunks = <T>(xs: T[], n = BATCH) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const missingColumn = (e: PgError) => !!e && (e.code === '42703' || /column .* does not exist/i.test(e.message ?? ''));
const hash = (parts: unknown) => createHash('sha1').update(JSON.stringify(parts)).digest('base64url').slice(0, 16);
const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().pop() ?? null;

/** Columns found missing, and when: not asked for again for a few minutes (until the SQL is run). */
const missingSince = new Map<string, number>();
const RECHECK_MS = 5 * 60_000;

/**
 * A read that asks for a column another branch adds (customer_ref, project_ref), and asks again without
 * it if the SQL hasn't been run yet. null if the table itself isn't there.
 */
async function withFallback<T>(run: (cols: string) => PromiseLike<Rows<T>>, cols: string, extra: string): Promise<T[] | null> {
  const gone = missingSince.get(extra);
  if (!gone || Date.now() - gone > RECHECK_MS) {
    const first = await run(`${cols}, ${extra}`);
    if (!first.error) {
      missingSince.delete(extra);
      return first.data ?? [];
    }
    if (!missingColumn(first.error)) return null;
    missingSince.set(extra, Date.now());
  }
  const second = await run(cols);
  return second.error ? null : (second.data ?? []);
}

/** .in() in batches of 100, run side by side. */
async function inBatches<T>(ids: string[], run: (batch: string[]) => PromiseLike<T[] | null>): Promise<T[]> {
  const parts = await Promise.all(chunks([...new Set(ids)]).map(run));
  return parts.flatMap((p) => p ?? []);
}

/** Every enquiry sharing these WhatsApp numbers, so one person's two enquiries are one chat. */
async function sameNumbers(db: Db, waIds: string[]): Promise<Enq[]> {
  return inBatches(waIds, (batch) =>
    withFallback<Enq>((cols) => db.from('enquiries').select(cols).in('wa_id', batch).limit(1000) as unknown as PromiseLike<Rows<Enq>>, ENQ_COLS, 'customer_ref')
  );
}

async function projectsFor(db: Db, enquiryIds: string[]): Promise<Proj[]> {
  return inBatches(enquiryIds, (batch) =>
    withFallback<Proj>((cols) => db.from('crm_projects').select(cols).in('enquiry_id', batch) as unknown as PromiseLike<Rows<Proj>>, PROJ_COLS, 'project_ref')
  );
}

async function pendingFor(db: Db, enquiryIds: string[]): Promise<Pending[]> {
  return inBatches(enquiryIds, async (batch) => {
    const { data } = await db.from('whatsapp_outbox').select('enquiry_id, kind, send_after, created_at').in('enquiry_id', batch).eq('status', 'pending');
    return (data ?? []) as Pending[];
  });
}

/** Group enquiries by WhatsApp number (or by themselves without one) and work out each chat. */
function buildDrafts(enquiries: Enq[], projects: Proj[], pending: Pending[], scope: ChatScope): Draft[] {
  const groups = new Map<string, Enq[]>();
  for (const e of enquiries) {
    const key = e.wa_id || e.id;
    const g = groups.get(key) ?? [];
    if (!g.some((x) => x.id === e.id)) g.push(e);
    groups.set(key, g);
  }
  const projectsOf = new Map<string, Proj[]>();
  for (const p of projects) projectsOf.set(p.enquiry_id, [...(projectsOf.get(p.enquiry_id) ?? []), p]);
  const kindsOf = new Map<string, Set<string>>();
  for (const p of pending) kindsOf.set(p.enquiry_id, (kindsOf.get(p.enquiry_id) ?? new Set()).add(p.kind));
  // The next message someone has scheduled for each enquiry (Send later), and when the newest was written.
  const laterOf = new Map<string, string>();
  const writtenOf = new Map<string, string>();
  for (const p of pending) {
    if (p.kind !== 'scheduled') continue;
    if (!laterOf.has(p.enquiry_id) || p.send_after < laterOf.get(p.enquiry_id)!) laterOf.set(p.enquiry_id, p.send_after);
    if (p.created_at > (writtenOf.get(p.enquiry_id) ?? '')) writtenOf.set(p.enquiry_id, p.created_at);
  }

  const drafts: Draft[] = [];
  for (const group of groups.values()) {
    // The live chat is on the enquiry with the newest message: the same rule as the record page.
    const thread = [...group].sort((a, b) => (b.wa_last_message_at || '').localeCompare(a.wa_last_message_at || ''))[0];
    const ids = group.map((e) => e.id);
    const theirs = ids.flatMap((id) => projectsOf.get(id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (scope === 'linked' && !theirs.length) continue;
    const open = theirs.find((p) => !CLOSED.has(p.stage)) ?? null;
    const kinds = new Set(ids.flatMap((id) => [...(kindsOf.get(id) ?? [])]));
    const queued = kinds.has('reply') || kinds.has('intro');
    const scheduledAt = ids.map((id) => laterOf.get(id)).filter((x): x is string => !!x).sort()[0] ?? null;
    const lastAt = latest(group.map((e) => e.wa_last_message_at));
    const lastInbound = latest(group.map((e) => e.wa_last_inbound_at));
    // Their message is the newest (an incoming message sets both times; ours only the last one).
    const theyWroteLast = !!lastInbound && lastInbound >= (lastAt ?? '');
    // A reply someone scheduled after their last message answers them; one scheduled before it doesn't.
    const answered = scheduledAnswers(latest(ids.map((id) => writtenOf.get(id))), lastInbound);
    const owner = (open && group.find((e) => e.id === open.enquiry_id)) || thread;
    drafts.push({
      threadId: thread.id,
      enquiryIds: ids,
      unreadIds: group.filter((e) => (e.wa_unread ?? 0) > 0).map((e) => e.id),
      waId: thread.wa_id,
      name: thread.name?.trim() || (thread.wa_id ? `+${thread.wa_id}` : 'Unknown'),
      phone: thread.phone ?? group.find((e) => e.phone)?.phone ?? null,
      customerRef: owner.customer_ref ?? group.find((e) => e.customer_ref)?.customer_ref ?? null,
      postcode: owner.postcode ?? group.find((e) => e.postcode)?.postcode ?? null,
      unread: group.reduce((n, e) => n + (e.wa_unread ?? 0), 0),
      needsReply: theyWroteLast && !queued && !answered,
      windowClosesAt: lastInbound ? new Date(new Date(lastInbound).getTime() + SERVICE_WINDOW_MS).toISOString() : null,
      queued,
      chasing: kinds.has('chase'),
      scheduledAt,
      project: open ? { id: open.id, ref: open.project_ref ?? null, stage: open.stage, title: open.title ?? '' } : null,
      hasProject: theirs.length > 0,
      lastAt,
      lastInbound,
    });
  }
  return drafts;
}

/** These enquiries' chats: the rest of each person's enquiries (same number), with their jobs and queue. */
async function draftsFor(db: Db, found: Enq[], scope: ChatScope): Promise<Draft[]> {
  const ids = found.map((e) => e.id);
  const [others, projects, pending] = await Promise.all([
    sameNumbers(db, found.map((e) => e.wa_id).filter((w): w is string => !!w)),
    projectsFor(db, ids),
    pendingFor(db, ids),
  ]);
  const seen = new Set(ids);
  const extra = others.filter((o) => !seen.has(o.id));
  const [moreProjects, morePending] = extra.length
    ? await Promise.all([projectsFor(db, extra.map((e) => e.id)), pendingFor(db, extra.map((e) => e.id))])
    : [[], []];
  return buildDrafts([...found, ...extra], [...projects, ...moreProjects], [...pending, ...morePending], scope);
}

/** Newest message first (chats never messaged last). */
const byLatest = (a: Draft, b: Draft) => (b.lastAt || '').localeCompare(a.lastAt || '');

/** Unread first (newest first), then waiting for our reply, then the most recent. */
function sortDrafts(drafts: Draft[]) {
  const rank = (d: Draft) => (d.unread > 0 ? 0 : d.needsReply ? 1 : 2);
  return drafts.sort((a, b) => rank(a) - rank(b) || (b.lastAt || '').localeCompare(a.lastAt || ''));
}

/** The newest message of each chat shown, for its preview line. */
async function withPreviews(db: Db, drafts: Draft[], canInbox: boolean): Promise<ActiveChat[]> {
  const lastBy = new Map<string, { direction: 'in' | 'out'; body: string | null; kind: string; at: string }>();
  await inBatches(
    drafts.map((d) => d.threadId),
    async (batch) => {
      const { data } = await db
        .from('whatsapp_messages')
        .select('enquiry_id, direction, kind, body, created_at')
        .in('enquiry_id', batch)
        .order('created_at', { ascending: false })
        .limit(1000);
      for (const m of (data ?? []) as { enquiry_id: string; direction: 'in' | 'out'; kind: string; body: string | null; created_at: string }[]) {
        if (!lastBy.has(m.enquiry_id)) lastBy.set(m.enquiry_id, { direction: m.direction, body: m.body, kind: m.kind, at: m.created_at });
      }
      return null;
    }
  );
  // Not among the newest 1,000 (a long chat elsewhere in the batch, as imported ones are): their last
  // message is the one at their last-message time.
  const missing = drafts.filter((d) => d.lastAt && !lastBy.has(d.threadId));
  await inBatches(
    missing.map((d) => d.threadId),
    async (batch) => {
      const times = [...new Set(missing.filter((d) => batch.includes(d.threadId)).map((d) => d.lastAt!))];
      const { data } = await db
        .from('whatsapp_messages')
        .select('enquiry_id, direction, kind, body, created_at')
        .in('enquiry_id', batch)
        .in('created_at', times)
        .limit(1000);
      const wanted = new Map(missing.map((d) => [d.threadId, Date.parse(d.lastAt!)]));
      for (const m of (data ?? []) as { enquiry_id: string; direction: 'in' | 'out'; kind: string; body: string | null; created_at: string }[]) {
        if (!lastBy.has(m.enquiry_id) && Date.parse(m.created_at) === wanted.get(m.enquiry_id)) {
          lastBy.set(m.enquiry_id, { direction: m.direction, body: m.body, kind: m.kind, at: m.created_at });
        }
      }
      return null;
    }
  );
  return drafts.map(({ lastAt, lastInbound, ...d }) => ({
    ...d,
    // Still not found (the times disagree): who wrote last, from the times.
    last: lastBy.get(d.threadId) ?? (lastAt ? { direction: lastInbound && lastInbound >= lastAt ? 'in' : 'out', body: null, kind: 'text', at: lastAt } : null),
    chatHref: canInbox ? `/admin/enquiries/inbox/${d.threadId}` : `/admin/crm/chats/${d.threadId}`,
  }));
}

const ZERO: ActiveCounts = { unread: 0, needsReply: 0, active: 0, waiting: 0 };

/**
 * The active chats: a message in the last 14 days, anything unread, or the 24-hour window open.
 * People who opted in but were never messaged are left out. With `known` (the version the browser
 * already has), answers { same: true } before reading any messages when nothing has changed.
 */
export async function activeChats(
  scope: ChatScope,
  opts: { limit: number; canInbox: boolean; known?: string | null }
): Promise<{ same: true; v: string } | { v: string; counts: ActiveCounts; rows: ActiveChat[] }> {
  const db = createAdminClient();
  const now = Date.now();
  const since = new Date(now - ACTIVE_DAYS * 86_400_000).toISOString();
  const windowSince = new Date(now - SERVICE_WINDOW_MS).toISOString();
  const recent = await withFallback<Enq>(
    (cols) =>
      db
        .from('enquiries')
        .select(cols)
        .or(`wa_last_message_at.gte."${since}",wa_unread.gt.0,wa_last_inbound_at.gte."${windowSince}"`)
        .order('wa_last_message_at', { ascending: false, nullsFirst: false })
        .limit(500) as unknown as PromiseLike<Rows<Enq>>,
    ENQ_COLS,
    'customer_ref'
  );
  // No WhatsApp columns yet (the SQL hasn't been run): an empty list rather than an error.
  if (!recent?.length) return { v: hash([]), counts: ZERO, rows: [] };

  const drafts = sortDrafts(await draftsFor(db, recent, scope));

  const v = hash(
    drafts.map((d) => [d.threadId, d.enquiryIds, d.unread, d.lastAt, d.queued, d.chasing, d.scheduledAt, d.needsReply, d.name, d.customerRef, d.project?.id, d.project?.stage, d.project?.ref, d.hasProject])
  );
  if (opts.known && opts.known === v) return { same: true, v };

  const counts: ActiveCounts = {
    unread: drafts.filter((d) => d.unread > 0).length,
    needsReply: drafts.filter((d) => d.needsReply).length,
    active: drafts.length,
    waiting: drafts.filter((d) => !!d.lastAt && !(d.lastInbound && d.lastInbound >= d.lastAt)).length,
  };
  return { v, counts, rows: await withPreviews(db, drafts.slice(0, opts.limit), opts.canInbox) };
}

/**
 * "All chats": every chat with any WhatsApp history, imported ones too, newest message first, `limit`
 * people at a time. `before` (the last page's `next`) gives the next page. Not polled: the dock lays
 * the live list over it.
 */
export async function allChats(
  scope: ChatScope,
  opts: { limit: number; canInbox: boolean; before?: string | null }
): Promise<{ rows: ActiveChat[]; next: string | null }> {
  const db = createAdminClient();
  const before = opts.before ?? null;
  const page = await withFallback<Enq>((cols) => {
    let q = db.from('enquiries').select(cols).not('wa_last_message_at', 'is', null);
    // Up to and including `before`: two people last messaged in the same minute aren't split up (the
    // dock drops the one it already has).
    if (before) q = q.lte('wa_last_message_at', before);
    return q.order('wa_last_message_at', { ascending: false }).order('id', { ascending: false }).limit(opts.limit) as unknown as PromiseLike<Rows<Enq>>;
  }, ENQ_COLS, 'customer_ref');
  if (!page?.length) return { rows: [], next: null };
  // A chat whose newest message is after `before` was on an earlier page (another enquiry on its number).
  const cut = before ? Date.parse(before) : null;
  const drafts = (await draftsFor(db, page, scope)).filter((d) => cut === null || !d.lastAt || Date.parse(d.lastAt) <= cut).sort(byLatest);
  const last = page[page.length - 1].wa_last_message_at;
  const next = page.length === opts.limit && last && Date.parse(last) !== cut ? last : null;
  return { rows: await withPreviews(db, drafts, opts.canInbox), next };
}

const SEARCH_LIMIT = 20;

/**
 * The dock's search box across every chat, not only the active ones: name, number (07700… or
 * +44 7700…), postcode or HX-ref, as chatMatches in dock-shared.ts. Up to 20, newest message first;
 * people never messaged are left out.
 */
export async function searchChats(scope: ChatScope, query: string, canInbox: boolean): Promise<ActiveChat[]> {
  // Characters that would change the meaning of a filter come out.
  const q = query.replace(/[,()%*\\"'`:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return [];
  const db = createAdminClient();
  const found = new Map<string, Enq>();
  const keep = (rows: Enq[] | null | undefined) => {
    for (const r of rows ?? []) if (!found.has(r.id)) found.set(r.id, r);
  };
  // Someone with a chat, or a number that may have one on another of their enquiries.
  const chats = 'wa_last_message_at.not.is.null,wa_id.not.is.null';
  const read = (filter: string) =>
    withFallback<Enq>(
      (cols) =>
        db
          .from('enquiries')
          .select(cols)
          .or(`and(or(${filter}),or(${chats}))`)
          .order('wa_last_message_at', { ascending: false, nullsFirst: false })
          .limit(40) as unknown as PromiseLike<Rows<Enq>>,
      ENQ_COLS,
      'customer_ref'
    );

  // References: the customer's own, and any of their jobs'. Nothing before customer-refs.sql.
  const refs = looksLikeRef(q) ? refPatterns(q) : [];
  if (refs.length) {
    const [byCustomer, byJob] = await Promise.all([
      read(refs.map((p) => `customer_ref.ilike.${p}`).join(',')),
      db
        .from('crm_projects')
        .select('enquiry_id, project_ref')
        .or(refs.map((p) => `project_ref.ilike.${p}`).join(','))
        .limit(40),
    ]);
    keep(byCustomer);
    const ids = byJob.error ? [] : [...new Set((byJob.data ?? []).filter((j) => refMatches(q, j.project_ref as string)).map((j) => j.enquiry_id as string))];
    if (ids.length) {
      keep(
        await withFallback<Enq>(
          (cols) => db.from('enquiries').select(cols).in('id', ids.slice(0, 100)).or(chats) as unknown as PromiseLike<Rows<Enq>>,
          ENQ_COLS,
          'customer_ref'
        )
      );
    }
  }
  // Name, postcode and number. "HX…" is only ever a reference; "0042" could be part of a number too.
  if (!refOnly(q)) {
    const ors = [`name.ilike.%${q}%`, `postcode.ilike.%${q}%`];
    const squashed = q.replace(/\s/g, '');
    if (/^[a-z]{1,2}\d[a-z\d]?\d[a-z]{2}$/i.test(squashed)) ors.push(`postcode.ilike.%${squashed.slice(0, -3)}%${squashed.slice(-3)}%`);
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3 && /^[\d\s+-]+$/.test(q)) {
      // Phones are kept as typed, WhatsApp ids as digits (447700…).
      const intl = digits.startsWith('0') ? `44${digits.slice(1)}` : digits;
      ors.push(`phone.ilike.%${digits}%`, `wa_id.like.*${intl}*`);
      if (digits.length >= 6) ors.push(`phone.ilike.%${digits.slice(0, -6)}%${digits.slice(-6, -3)}%${digits.slice(-3)}%`);
    }
    keep(await read(ors.join(',')));
  }
  if (!found.size) return [];
  const drafts = (await draftsFor(db, [...found.values()], scope))
    .filter((d) => d.lastAt)
    .sort(byLatest)
    .slice(0, SEARCH_LIMIT);
  return withPreviews(db, drafts, canInbox);
}

/** One customer's chat row (?enquiry=), whether or not it's active. null if they can't see it. */
export async function activeChatFor(scope: ChatScope, enquiryId: string, canInbox: boolean): Promise<ActiveChat | null> {
  const db = createAdminClient();
  const found = await withFallback<Enq>(
    (cols) => db.from('enquiries').select(cols).eq('id', enquiryId).limit(1) as unknown as PromiseLike<Rows<Enq>>,
    ENQ_COLS,
    'customer_ref'
  );
  const e = found?.[0];
  if (!e) return null;
  const others = e.wa_id ? await sameNumbers(db, [e.wa_id]) : [];
  const enquiries = [e, ...others.filter((o) => o.id !== e.id)];
  const ids = enquiries.map((x) => x.id);
  const [projects, pending] = await Promise.all([projectsFor(db, ids), pendingFor(db, ids)]);
  const drafts = buildDrafts(enquiries, projects, pending, scope);
  return drafts.length ? (await withPreviews(db, drafts, canInbox))[0] : null;
}

/** Enquiry ids whose WhatsApp number has an opportunity in the CRM (any stage). */
async function linkedIds(db: Db, enquiries: { id: string; wa_id: string | null }[]): Promise<Set<string>> {
  const waIds = [...new Set(enquiries.map((e) => e.wa_id).filter((w): w is string => !!w))];
  const sharing = await inBatches(waIds, async (batch) => {
    const { data } = await db.from('enquiries').select('id, wa_id').in('wa_id', batch).limit(1000);
    return (data ?? []) as { id: string; wa_id: string | null }[];
  });
  const all = [...enquiries, ...sharing];
  const withJob = new Set(
    await inBatches(
      all.map((e) => e.id),
      async (batch) => {
        const { data } = await db.from('crm_projects').select('enquiry_id').in('enquiry_id', batch);
        return ((data ?? []) as { enquiry_id: string }[]).map((p) => p.enquiry_id);
      }
    )
  );
  const numbersWithJob = new Set(all.filter((e) => e.wa_id && withJob.has(e.id)).map((e) => e.wa_id));
  return new Set(enquiries.filter((e) => withJob.has(e.id) || (e.wa_id && numbersWithJob.has(e.wa_id))).map((e) => e.id));
}

/** Which of these enquiries a CRM-only person may see the chat of (their number has an opportunity). */
export async function linkedEnquiries(enquiryIds: string[]): Promise<Set<string>> {
  if (!enquiryIds.length) return new Set();
  const db = createAdminClient();
  const rows = await inBatches(enquiryIds, async (batch) => {
    const { data } = await db.from('enquiries').select('id, wa_id').in('id', batch);
    return (data ?? []) as { id: string; wa_id: string | null }[];
  });
  return linkedIds(db, rows);
}

/** People with unread WhatsApp messages, counted once per number (the menu badge). 0 if the tables aren't there. */
export async function unreadPeople(scope: ChatScope): Promise<number> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.from('enquiries').select('id, wa_id').gt('wa_unread', 0).limit(500);
    if (error || !data) return 0;
    let rows = data as { id: string; wa_id: string | null }[];
    if (scope === 'linked') {
      const ok = await linkedIds(db, rows);
      rows = rows.filter((r) => ok.has(r.id));
    }
    return new Set(rows.map((r) => r.wa_id || r.id)).size;
  } catch {
    return 0;
  }
}

/** Whether this enquiry, or another on the same WhatsApp number, has an opportunity (any stage). */
export async function linkedToOpportunity(enquiryId: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data: e } = await db.from('enquiries').select('id, wa_id').eq('id', enquiryId).maybeSingle();
    if (!e) return false;
    return (await linkedIds(db, [e as { id: string; wa_id: string | null }])).has(enquiryId);
  } catch {
    return false;
  }
}

/**
 * The "Back to job" chip on a chat page opened from a job (?job={id}&tab={tab}): the job's stage, read
 * here so the chip can say "Quote sent". null without CRM access or for an unknown job.
 */
export async function chatJob(
  projectId: string | undefined,
  tab: string | undefined,
  canCrm: boolean
): Promise<{ projectId: string; stage: string | null; tab: string | null } | null> {
  if (!canCrm || !projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const { data } = await createAdminClient().from('crm_projects').select('id, stage').eq('id', projectId).maybeSingle();
  if (!data) return null;
  return { projectId: data.id as string, stage: (data.stage as string) ?? null, tab: tab && /^[a-z-]{1,20}$/.test(tab) ? tab : null };
}

/** The newest opportunity among these enquiries that isn't Complete or Lost. */
export async function latestOpenOpportunity(enquiryIds: string[]): Promise<{ id: string; ref: string | null; stage: string; title: string } | null> {
  const db = createAdminClient();
  const open = (await projectsFor(db, enquiryIds))
    .filter((p) => !CLOSED.has(p.stage))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return open ? { id: open.id, ref: open.project_ref ?? null, stage: open.stage, title: open.title ?? '' } : null;
}
