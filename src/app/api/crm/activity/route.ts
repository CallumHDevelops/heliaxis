import { createAdminClient } from '@/lib/supabase/admin';
import { ukDay } from '@/lib/bank-holidays';
import { crmSession, json } from '@/lib/crm/server';
import { canAccess } from '@/lib/portals';
import {
  classifyActivity,
  cursorOf,
  dbFilterFor,
  FEED_CHIPS,
  feedOrder,
  inFeed,
  mergeFeed,
  NOTE_CHIPS,
  parseCursor,
  readChatDays,
  type ChatDay,
  type FeedChip,
  type FeedKind,
  type FeedPos,
  type NoteChip,
} from '@/lib/projects/feed';
import { readAll, withFallback } from '@/lib/projects/server';
import { linkedEnquiries } from '@/lib/whatsapp/active';
import { chatReader, messageBodies } from '@/lib/whatsapp/chat-feed';
import { shownBody } from '@/lib/whatsapp/describe';

export const dynamic = 'force-dynamic';

const PAGE = 100;
const ROUNDS = 6;

type Act = { id: string; enquiry_id: string; project_id: string | null; kind: string; body: string | null; meta: Record<string, unknown> | null; by_id: string | null; at: string };
type Job = { id: string; enquiry_id: string; title: string; stage: string; created_at: string; project_ref?: string | null };
type Cust = { id: string; name: string; postcode: string | null; customer_ref?: string | null };
type Res<T> = { data: T[] | null; error: { code?: string; message?: string } | null };
/** A row of the page: a timeline entry or a chat's day. */
type Entry = { id: string; at: string; act?: Act & { feed: FeedKind; milestone: boolean }; chat?: ChatDay };

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
const firstWord = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '';
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

/**
 * The timeline's rows after a place in Latest notes, as one PostgREST `or` with the kinds asked for.
 * At the same moment the rows run by id, so after a timeline row means a lower id; after a chat row
 * (`wa:…`) or the top of a moment, every row at that moment is still to come.
 */
function timelineAfter(kinds: string, p: FeedPos | null): { or: string; lt?: string; lte?: string } {
  if (!p) return { or: kinds };
  if (isUuid(p.key)) return { or: `and(or(${kinds}),or(at.lt."${p.at}",and(at.eq."${p.at}",id.lt.${p.key})))` };
  return p.key ? { or: kinds, lte: p.at } : { or: kinds, lt: p.at };
}

/** What a message without text was, for the row's last line. */
function mediaWord(kind: string) {
  if (kind === 'image') return 'Photo';
  if (kind === 'document') return 'Document';
  if (kind === 'audio') return 'Voice note';
  if (kind === 'video') return 'Video';
  return kind === 'template' ? 'Template' : 'Message';
}

/**
 * Latest notes on the CRM home: notes, calls, site visits, surveys, emails and documents from every job,
 * and WhatsApp chats as one row per chat per day it was busy (imported chats too), newest first.
 * ?kinds=note,call,visit,survey,email,doc,whatsapp (default all) · mine=1 (only mine: my notes, and the
 * WhatsApps I sent) · stages=1 (stage moves and other updates too; milestones always show) ·
 * before={next} · limit (default 30, up to 50). Never single WhatsApp messages, days of automatic
 * messages only, or import rows. CRM staff without Enquiries see only the chats of customers with a job.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const asked = (url.searchParams.get('kinds') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k): k is NoteChip => (NOTE_CHIPS as readonly string[]).includes(k));
  const wanted = asked.length ? [...new Set(asked)] : [...NOTE_CHIPS];
  const chips = wanted.filter((k): k is FeedChip => (FEED_CHIPS as readonly string[]).includes(k));
  const withChats = wanted.includes('whatsapp');
  const mine = url.searchParams.get('mine') === '1';
  const stages = url.searchParams.get('stages') === '1';
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  // Where the page before stopped ("{time}|{row id}"; a bare time from before this is still read).
  const start = parseCursor(url.searchParams.get('before'));
  const canInbox = canAccess(s.profile, 'enquiries');
  const db = createAdminClient();

  // The timeline: page back until there are enough rows that belong in the feed, each read carrying on
  // exactly after the last row read (newest first, then by id), so none is read twice or skipped.
  const acts: NonNullable<Entry['act']>[] = [];
  let actHorizon: FeedPos | null = null;
  if (chips.length) {
    const kinds = dbFilterFor(chips, stages);
    let after = start;
    let more = true;
    for (let round = 0; round < ROUNDS && acts.length < limit && more; round++) {
      const where = timelineAfter(kinds, after);
      let q = db.from('crm_activities').select('id, enquiry_id, project_id, kind, body, meta, by_id, at').or(where.or);
      if (where.lt) q = q.lt('at', where.lt);
      if (where.lte) q = q.lte('at', where.lte);
      if (mine) q = q.eq('by_id', s.user.id);
      const { data, error } = await q.order('at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
      if (error) return json({ error: error.message, items: [], next: null }, 500);
      const rows = (data ?? []) as Act[];
      more = rows.length === PAGE;
      for (const r of rows) {
        if (acts.length >= limit) break;
        after = { at: r.at, key: r.id };
        const c = classifyActivity(r);
        if (inFeed(c, chips, stages)) acts.push({ ...r, feed: c.kind, milestone: c.milestone });
      }
    }
    // Read to the last row shown (or the last row read, if none of them belonged).
    const lastShown = acts[limit - 1];
    actHorizon = lastShown ? { at: lastShown.at, key: lastShown.id } : more ? after : null;
  }

  // WhatsApp: a row per chat per busy day. Nothing (rather than an error) before whatsapp.sql.
  let days: ChatDay[] = [];
  let chatHorizon: FeedPos | null = null;
  if (withChats) {
    try {
      const read = await readChatDays(chatReader(mine ? s.user.id : null), { before: start, want: limit, dayOf: ukDay });
      days = read.days;
      chatHorizon = read.horizon;
      if (!canInbox && days.length) {
        const ok = await linkedEnquiries([...new Set(days.map((d) => d.enquiryId))]);
        days = days.filter((d) => ok.has(d.enquiryId));
      }
    } catch {
      days = [];
      chatHorizon = null;
    }
  }

  // The two, newest first: the next page starts where either stopped reading.
  const page = mergeFeed<Entry>(
    [
      { items: acts.map((a) => ({ id: a.id, at: a.at, act: a })), horizon: actHorizon },
      { items: days.map((d) => ({ id: d.id, at: d.at, chat: d })), horizon: chatHorizon },
    ],
    limit
  );
  const items = page.items;
  // (Never the place this page started from: that would load the same page for ever.)
  const next = page.next && !(start && feedOrder(page.next, start) <= 0) ? cursorOf(page.next) : null;

  const enquiryIds = [...new Set(items.map((i) => i.act?.enquiry_id ?? i.chat!.enquiryId))];
  const authors = [...new Set(items.map((i) => i.act?.by_id ?? i.chat?.last.sent_by).filter((x): x is string => !!x))];
  const [jobs, customers, people, bodies] = await Promise.all([
    readAll<Job>(enquiryIds, (b, from, to) =>
      withFallback<Job>(
        (cols) => db.from('crm_projects').select(cols).in('enquiry_id', b).order('id').range(from, to) as unknown as PromiseLike<Res<Job>>,
        'id, enquiry_id, title, stage, created_at',
        'project_ref'
      )
    ),
    readAll<Cust>(enquiryIds, (b, from, to) =>
      withFallback<Cust>(
        (cols) => db.from('enquiries').select(cols).in('id', b).order('id').range(from, to) as unknown as PromiseLike<Res<Cust>>,
        'id, name, postcode',
        'customer_ref'
      )
    ),
    readAll<{ id: string; full_name: string | null; email: string | null }>(authors, (b, from, to) =>
      db.from('profiles').select('id, full_name, email').in('id', b).order('id').range(from, to)
    ),
    messageBodies(items.map((i) => i.chat?.last.id).filter((x): x is string => !!x)),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  // A row with no job (a customer change, a chat) links to the customer's latest live job, else their latest.
  const open = (j: Job) => j.stage !== 'complete' && j.stage !== 'lost';
  const latestOf = new Map<string, Job>();
  for (const j of [...jobs].sort((a, b) => Number(open(b)) - Number(open(a)) || b.created_at.localeCompare(a.created_at))) {
    if (!latestOf.has(j.enquiry_id)) latestOf.set(j.enquiry_id, j);
  }
  const cust = new Map(customers.map((c) => [c.id, c]));
  const nameOf = new Map(people.map((p) => [p.id, p.full_name || p.email || 'Team']));
  const jobOf = (j: Job | null | undefined) => (j ? { id: j.id, title: j.title, stage: j.stage, ref: j.project_ref ?? null } : null);
  const customerOf = (c: Cust | undefined) => (c ? { id: c.id, name: c.name, ref: c.customer_ref ?? null, postcode: c.postcode } : null);
  /** Who wrote a chat's last message: them, someone on the team, the app's number (imported or typed there), or something automatic. */
  const fromOf = (m: ChatDay['last'], c: Cust | undefined) => {
    if (m.direction === 'in') return { side: 'them', name: firstWord(c?.name) || 'Customer' };
    if (m.sent_by) return { side: 'us', name: firstWord(nameOf.get(m.sent_by)) || 'Team', me: m.sent_by === s.user.id };
    if (m.via === 'import' || m.via === 'whatsapp-app') return { side: 'us', name: 'Heliaxis' };
    return { side: 'us', name: m.rule_id ? 'Smart reply' : m.via === 'chase' ? 'Chaser' : 'Automatic' };
  };

  return json({
    items: items.map((entry) => {
      if (entry.chat) {
        const d = entry.chat;
        const c = cust.get(d.enquiryId);
        return {
          id: d.id,
          kind: 'whatsapp',
          type: 'whatsapp',
          body: shownBody(bodies.get(d.last.id) ?? null)?.trim() || mediaWord(d.last.kind),
          at: d.at,
          day: d.day,
          milestone: false,
          by: null,
          meta: null,
          project: jobOf(latestOf.get(d.enquiryId)),
          customer: customerOf(c),
          chat: {
            enquiryId: d.enquiryId,
            count: d.count,
            imported: d.imported === d.count,
            mine,
            lastId: d.last.id,
            from: fromOf(d.last, c),
            href: canInbox ? `/admin/enquiries/inbox/${d.enquiryId}` : `/admin/crm/chats/${d.enquiryId}`,
          },
        };
      }
      const i = entry.act!;
      const job = (i.project_id && jobById.get(i.project_id)) || latestOf.get(i.enquiry_id) || null;
      const by = i.by_id ? (nameOf.get(i.by_id) ?? 'Team') : null;
      return {
        id: i.id,
        kind: i.feed,
        type: i.kind,
        body: i.body,
        at: i.at,
        day: ukDay(i.at),
        milestone: i.milestone,
        by: i.by_id && by ? { id: i.by_id, name: by, initials: initials(by) } : null,
        meta: i.meta,
        project: jobOf(job),
        customer: customerOf(cust.get(i.enquiry_id)),
      };
    }),
    next,
  });
}
