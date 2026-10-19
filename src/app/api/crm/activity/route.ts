import { createAdminClient } from '@/lib/supabase/admin';
import { ukDay } from '@/lib/bank-holidays';
import { crmSession, json } from '@/lib/crm/server';
import { classifyActivity, dbFilterFor, FEED_CHIPS, inFeed, type FeedKind } from '@/lib/projects/feed';
import { readAll, withFallback } from '@/lib/projects/server';

export const dynamic = 'force-dynamic';

const PAGE = 100;
const ROUNDS = 6;

type Act = { id: string; enquiry_id: string; project_id: string | null; kind: string; body: string | null; meta: Record<string, unknown> | null; by_id: string | null; at: string };
type Job = { id: string; enquiry_id: string; title: string; stage: string; created_at: string; project_ref?: string | null };
type Cust = { id: string; name: string; postcode: string | null; customer_ref?: string | null };
type Res<T> = { data: T[] | null; error: { code?: string; message?: string } | null };

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/**
 * Latest notes on the CRM home: notes, calls, site visits, surveys, emails and documents from every job,
 * newest first. ?kinds=note,call,visit,survey,email,doc (default all) · mine=1 (only mine) · stages=1
 * (stage moves and other updates too; milestones always show) · before={iso} · limit (default 30, up
 * to 50). Never WhatsApp messages (they're in the dock) or import rows.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const asked = (url.searchParams.get('kinds') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k): k is (typeof FEED_CHIPS)[number] => (FEED_CHIPS as readonly string[]).includes(k));
  const chips = asked.length ? [...new Set(asked)] : [...FEED_CHIPS];
  const mine = url.searchParams.get('mine') === '1';
  const stages = url.searchParams.get('stages') === '1';
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  const beforeRaw = url.searchParams.get('before');
  let before = beforeRaw && Number.isFinite(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : null;
  const db = createAdminClient();
  const filter = dbFilterFor(chips, stages);

  // Page back through the timeline until there are enough rows that belong in the feed.
  const items: (Act & { feed: FeedKind; milestone: boolean })[] = [];
  let more = true;
  for (let round = 0; round < ROUNDS && items.length < limit && more; round++) {
    let q = db.from('crm_activities').select('id, enquiry_id, project_id, kind, body, meta, by_id, at').or(filter);
    if (mine) q = q.eq('by_id', s.user.id);
    if (before) q = q.lt('at', before);
    const { data, error } = await q.order('at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
    if (error) return json({ error: error.message, items: [], next: null }, 500);
    const rows = (data ?? []) as Act[];
    more = rows.length === PAGE;
    for (const r of rows) {
      if (items.length >= limit) break;
      const c = classifyActivity(r);
      if (inFeed(c, chips, stages)) items.push({ ...r, feed: c.kind, milestone: c.milestone });
    }
    if (rows.length) before = rows[rows.length - 1].at;
  }
  // The next page starts after the last row shown (or the last row read, if none of them belonged).
  const next = items.length >= limit ? items[items.length - 1].at : more ? before : null;

  const enquiryIds = [...new Set(items.map((i) => i.enquiry_id))];
  const authors = [...new Set(items.map((i) => i.by_id).filter((x): x is string => !!x))];
  const [jobs, customers, people] = await Promise.all([
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
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  // A row with no job (a customer change) links to the customer's latest live job, else their latest.
  const open = (j: Job) => j.stage !== 'complete' && j.stage !== 'lost';
  const latestOf = new Map<string, Job>();
  for (const j of [...jobs].sort((a, b) => Number(open(b)) - Number(open(a)) || b.created_at.localeCompare(a.created_at))) {
    if (!latestOf.has(j.enquiry_id)) latestOf.set(j.enquiry_id, j);
  }
  const cust = new Map(customers.map((c) => [c.id, c]));
  const nameOf = new Map(people.map((p) => [p.id, p.full_name || p.email || 'Team']));

  return json({
    items: items.map((i) => {
      const job = (i.project_id && jobById.get(i.project_id)) || latestOf.get(i.enquiry_id) || null;
      const c = cust.get(i.enquiry_id);
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
        project: job ? { id: job.id, title: job.title, stage: job.stage, ref: job.project_ref ?? null } : null,
        customer: c ? { id: c.id, name: c.name, ref: c.customer_ref ?? null, postcode: c.postcode } : null,
      };
    }),
    next,
  });
}
