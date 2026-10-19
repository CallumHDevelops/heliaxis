import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { SERVICE_WINDOW_MS } from '@/lib/whatsapp/shared';
import type { ActiveChat, ActiveCounts } from '@/components/admin/whatsapp/dock-shared';

/**
 * The WhatsApp dock's chat list (GET /api/whatsapp/active): one row per WhatsApp number that's been
 * busy lately, with the person's latest open opportunity. Read-only: it never sends what's queued and
 * never clears anything as read (the chat itself does that, only while it's on screen).
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
type Pending = { enquiry_id: string; kind: string };
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
    const { data } = await db.from('whatsapp_outbox').select('enquiry_id, kind').in('enquiry_id', batch).eq('status', 'pending');
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
    const lastAt = latest(group.map((e) => e.wa_last_message_at));
    const lastInbound = latest(group.map((e) => e.wa_last_inbound_at));
    // Their message is the newest (an incoming message sets both times; ours only the last one).
    const theyWroteLast = !!lastInbound && lastInbound >= (lastAt ?? '');
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
      needsReply: theyWroteLast && !queued,
      windowClosesAt: lastInbound ? new Date(new Date(lastInbound).getTime() + SERVICE_WINDOW_MS).toISOString() : null,
      queued,
      chasing: kinds.has('chase'),
      project: open ? { id: open.id, ref: open.project_ref ?? null, stage: open.stage, title: open.title ?? '' } : null,
      hasProject: theirs.length > 0,
      lastAt,
      lastInbound,
    });
  }
  return drafts;
}

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
  return drafts.map(({ lastAt, lastInbound, ...d }) => ({
    ...d,
    // Not among the newest 1,000 (a very long chat elsewhere in the batch): who wrote last, from the times.
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

  // The rest of each person's enquiries (same number), alongside the jobs and queue for these ones.
  const recentIds = recent.map((e) => e.id);
  const [others, recentProjects, recentPending] = await Promise.all([
    sameNumbers(db, recent.map((e) => e.wa_id).filter((w): w is string => !!w)),
    projectsFor(db, recentIds),
    pendingFor(db, recentIds),
  ]);
  const seen = new Set(recentIds);
  const extra = others.filter((o) => !seen.has(o.id));
  const [moreProjects, morePending] = extra.length
    ? await Promise.all([projectsFor(db, extra.map((e) => e.id)), pendingFor(db, extra.map((e) => e.id))])
    : [[], []];
  const enquiries = [...recent, ...extra];
  const drafts = sortDrafts(buildDrafts(enquiries, [...recentProjects, ...moreProjects], [...recentPending, ...morePending], scope));

  const v = hash(
    drafts.map((d) => [d.threadId, d.enquiryIds, d.unread, d.lastAt, d.queued, d.chasing, d.name, d.customerRef, d.project?.id, d.project?.stage, d.project?.ref, d.hasProject])
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
