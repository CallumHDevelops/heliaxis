import { createAdminClient } from '@/lib/supabase/admin';
import { requireApproved } from '@/lib/auth';
import { json } from '@/lib/crm/server';
import { findCustomers } from '@/lib/customer-search';
import { cleanSearch, groupResults, jobMatches, orgResults, postcodePattern, type JobRow, type PersonRow, type SearchOrg } from '@/lib/global-search';
import { orgsReady, searchOrganisations } from '@/lib/organisations/server';
import { sourcesNow } from '@/lib/lead-source-server';
import { canAccess } from '@/lib/portals';
import { looksLikeRef, refOnly, refPatterns } from '@/lib/projects/refs';
import { missingColumn, type Db } from '@/lib/projects/server';
import { accentPattern, everyGroup, searchWords, withoutAccents } from '@/lib/search-words';

export const dynamic = 'force-dynamic';

const JOB_COLS = 'id, enquiry_id, title, stage, created_at, address, postcode';
const PERSON_COLS = 'id, name, postcode, phone, source, status, created_at';

/** One word's alternatives on a job: title or site address (accents aside), postcode, or its reference. */
function jobWord(w: string): string[] {
  const ors = refOnly(w) ? [] : [`title.ilike.%${w}%`, `address.ilike.%${w}%`, `postcode.ilike.%${w}%`];
  const postcode = refOnly(w) ? null : postcodePattern(w);
  if (postcode) ors.push(`postcode.ilike.${postcode}`);
  const accents = refOnly(w) ? null : accentPattern(w);
  if (accents) ors.push(`title.imatch.${accents}`, `address.imatch.${accents}`);
  return [...ors, ...(looksLikeRef(w) ? refPatterns(w).map((p) => `project_ref.ilike.${p}`) : [])];
}

/** Jobs that match by themselves, every word: their title, site address or postcode, or their reference (crm-v3.sql). */
async function jobsMatching(db: Db, q: string): Promise<JobRow[]> {
  const groups = searchWords(q).map(jobWord);
  if (!groups.length || groups.some((g) => !g.length)) return [];
  const read = (cols: string, gs: string[][]) =>
    db.from('crm_projects').select(cols).or(everyGroup(gs)).order('updated_at', { ascending: false }).limit(20);
  let cols = `${JOB_COLS}, project_ref`;
  let gs = groups;
  let r = await read(cols, gs);
  // Before crm-v3.sql there are no job references.
  const text = gs.map((g) => g.filter((o) => !o.startsWith('project_ref')));
  if (r.error && missingColumn(r.error) && text.every((g) => g.length)) r = await read((cols = JOB_COLS), (gs = text));
  // A database that refuses the accent patterns still gets the rest.
  if (r.error && gs.some((g) => g.some((o) => o.includes('.imatch.')))) r = await read(cols, withoutAccents(gs));
  if (r.error) return [];
  return ((r.data ?? []) as unknown as JobRow[]).filter((j) => jobMatches(j, q));
}

/**
 * GET /api/search?q= — the dashboard's and the header's search, for Enquiries and CRM staff, word by
 * word ("rob evans", src/lib/search-words.ts): people by name, email, phone, postcode or HX reference,
 * and (CRM staff) jobs by title, site address, postcode or reference, each person with their jobs
 * (src/lib/global-search.ts). Up to 8 people, 3 jobs each, then (CRM staff) organisations found by their
 * own details or a contact's (src/lib/organisations/server.ts). It only reads: picking a result opens a
 * page, it never makes an opportunity.
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

  // Organisations and their contacts (CRM staff, once organisations.sql has run): never customers, so a list of their own.
  const orgsFound: Promise<SearchOrg[]> = crm ? orgsReady().then((ready) => (ready ? searchOrganisations(db, q).then((hits) => orgResults(q, hits)) : [])) : Promise.resolve([]);
  const [found, direct, orgs] = await Promise.all([findCustomers(db, q), crm ? jobsMatching(db, q) : Promise.resolve([] as JobRow[]), orgsFound]);
  if (found.error && !direct.length && !orgs.length) return json({ q, error: 'Search isn’t working right now. Try again in a moment.', people: [], orgs: [] }, 500);
  const ids = [...new Set([...found.customers.map((c) => c.id), ...direct.map((j) => j.enquiry_id)])];
  if (!ids.length) return json({ q, people: [], orgs });

  // Everything shown about them in one read (the reference once customer-refs.sql has run), and their jobs.
  const readPeople = (cols: string) => db.from('enquiries').select(cols).in('id', ids);
  const readJobs = (cols: string) => db.from('crm_projects').select(cols).in('enquiry_id', ids).order('created_at', { ascending: false }).limit(500);
  const [people, jobs] = await Promise.all([
    readPeople(`${PERSON_COLS}, customer_ref`).then((r) => (r.error && missingColumn(r.error) ? readPeople(PERSON_COLS) : r)),
    crm ? readJobs(`${JOB_COLS}, project_ref`).then((r) => (r.error && missingColumn(r.error) ? readJobs(JOB_COLS) : r)) : null,
  ]);
  if (people.error) return json({ q, error: 'Search isn’t working right now. Try again in a moment.', people: [], orgs }, 500);

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
  return json({ q, people: results.map((p) => ({ ...p, source: sources.get(p.id)?.label ?? p.source })), orgs });
}
