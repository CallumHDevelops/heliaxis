import { createAdminClient } from '@/lib/supabase/admin';
import { requireApproved } from '@/lib/auth';
import { json } from '@/lib/crm/server';
import { findCustomers } from '@/lib/customer-search';
import { cleanSearch, groupResults, jobMatches, postcodePattern, type JobRow, type PersonRow } from '@/lib/global-search';
import { sourcesNow } from '@/lib/lead-source-server';
import { canAccess } from '@/lib/portals';
import { looksLikeRef, refOnly, refPatterns } from '@/lib/projects/refs';
import { missingColumn, type Db } from '@/lib/projects/server';

export const dynamic = 'force-dynamic';

const JOB_COLS = 'id, enquiry_id, title, stage, created_at, address, postcode';
const PERSON_COLS = 'id, name, postcode, phone, source, status, created_at';

/** Jobs that match by themselves: their title, site address or postcode, or their reference (crm-v3.sql). */
async function jobsMatching(db: Db, q: string): Promise<JobRow[]> {
  const refs = looksLikeRef(q) ? refPatterns(q) : [];
  const text = refOnly(q) ? [] : [`title.ilike.%${q}%`, `address.ilike.%${q}%`, `postcode.ilike.%${q}%`];
  const postcode = refOnly(q) ? null : postcodePattern(q);
  if (postcode) text.push(`postcode.ilike.${postcode}`);
  const read = (cols: string, ors: string[]) =>
    db.from('crm_projects').select(cols).or(ors.join(',')).order('updated_at', { ascending: false }).limit(20);
  const all = [...text, ...refs.map((p) => `project_ref.ilike.${p}`)];
  if (!all.length) return [];
  let r = await read(`${JOB_COLS}, project_ref`, all);
  // Before crm-v3.sql there are no job references.
  if (r.error && missingColumn(r.error) && text.length) r = await read(JOB_COLS, text);
  if (r.error) return [];
  return ((r.data ?? []) as unknown as JobRow[]).filter((j) => jobMatches(j, q));
}

/**
 * GET /api/search?q= — the dashboard's and the header's search, for Enquiries and CRM staff: people by
 * name, email, phone, postcode or HX reference, and (CRM staff) jobs by title, site address, postcode or
 * reference, each person with their jobs (src/lib/global-search.ts). Up to 8 people, 3 jobs each. It
 * only reads: picking a result opens a page, it never makes an opportunity.
 */
export async function GET(req: Request) {
  const s = await requireApproved();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const crm = canAccess(s.profile, 'crm');
  const enquiries = canAccess(s.profile, 'enquiries');
  if (!crm && !enquiries) return json({ error: 'forbidden' }, 403);

  const q = cleanSearch(new URL(req.url).searchParams.get('q'));
  if (q.length < 2) return json({ q, people: [] });
  const db = createAdminClient();

  const [found, direct] = await Promise.all([findCustomers(db, q), crm ? jobsMatching(db, q) : Promise.resolve([] as JobRow[])]);
  if (found.error && !direct.length) return json({ q, error: 'Search isn’t working right now. Try again in a moment.', people: [] }, 500);
  const ids = [...new Set([...found.customers.map((c) => c.id), ...direct.map((j) => j.enquiry_id)])];
  if (!ids.length) return json({ q, people: [] });

  // Everything shown about them in one read (the reference once customer-refs.sql has run), and their jobs.
  const readPeople = (cols: string) => db.from('enquiries').select(cols).in('id', ids);
  const readJobs = (cols: string) => db.from('crm_projects').select(cols).in('enquiry_id', ids).order('created_at', { ascending: false }).limit(500);
  const [people, jobs] = await Promise.all([
    readPeople(`${PERSON_COLS}, customer_ref`).then((r) => (r.error && missingColumn(r.error) ? readPeople(PERSON_COLS) : r)),
    crm ? readJobs(`${JOB_COLS}, project_ref`).then((r) => (r.error && missingColumn(r.error) ? readJobs(JOB_COLS) : r)) : null,
  ]);
  if (people.error) return json({ q, error: 'Search isn’t working right now. Try again in a moment.', people: [] }, 500);

  const rows = (people.data ?? []) as unknown as PersonRow[];
  const results = groupResults({
    q,
    refs: found.refs,
    people: rows,
    jobs: jobs && !jobs.error ? ((jobs.data ?? []) as unknown as JobRow[]) : direct,
    matched: new Set(direct.map((j) => j.id)),
    enquiries,
  });
  // Where the ones shown came from, with a Meta ad's name now (they keep the name it had when they came in).
  const shown = new Set(results.map((p) => p.id));
  const sources = await sourcesNow(rows.filter((r) => shown.has(r.id)));
  return json({ q, people: results.map((p) => ({ ...p, source: sources.get(p.id)?.label ?? p.source })) });
}
