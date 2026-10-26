import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { findCustomers, type FoundCustomer } from '@/lib/customer-search';
import { cleanSearch, customerRank } from '@/lib/global-search';
import { possibleDuplicates } from '@/lib/projects/duplicates';
import { readAll } from '@/lib/projects/server';
import { nameRank } from '@/lib/search-words';

export const dynamic = 'force-dynamic';

const LIMIT = 20;

type Job = { id: string; enquiry_id: string; address: string | null; postcode: string | null; products: string[]; created_at: string; project_ref?: string | null };

/**
 * Customer search for the New project sheet and the CRM search, word by word ("rob evans"): name, email,
 * phone digits, postcode, or a reference (HX-0042, hx42, 0042) once customer-refs.sql has been run
 * (src/lib/customer-search.ts). Names the words start come first. Up to 20, each with how many jobs
 * they have, their latest site address and a possible-duplicate flag.
 */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const q = cleanSearch(new URL(req.url).searchParams.get('q'));
  if (q.length < 2) return json({ customers: [] });
  const db = createAdminClient();

  const withContacts = new URL(req.url).searchParams.get('contacts') === '1';
  const found = await findCustomers(db, q, LIMIT);
  if (found.error) return json({ error: found.error, customers: [] }, 500);
  const { refs } = found;
  const list = found.customers;
  const ids = list.map((c) => c.id);
  if (!ids.length) return json({ customers: withContacts ? await contactMatches(db, q, []) : [] });
  const [jobs, dupes, refRows] = await Promise.all([
    readAll<Job>(ids, async (b, from, to) => {
      const read = (cols: string) => db.from('crm_projects').select(cols).in('enquiry_id', b).order('created_at', { ascending: false }).range(from, to);
      const first = await read('id, enquiry_id, address, postcode, products, created_at, project_ref');
      return (first.error ? await read('id, enquiry_id, address, postcode, products, created_at') : first) as unknown as { data: Job[] | null; error: null };
    }),
    possibleDuplicates(ids),
    // Their own references, for showing (the name search doesn't ask for the column).
    db
      .from('enquiries')
      .select('id, customer_ref')
      .in('id', ids)
      .then(
        (r) => (r.error ? [] : ((r.data ?? []) as { id: string; customer_ref: string | null }[])),
        () => []
      ),
  ]);
  const refOf = new Map(refRows.map((r) => [r.id, r.customer_ref]));
  const jobsOf = new Map<string, Job[]>();
  for (const j of jobs) jobsOf.set(j.enquiry_id, [...(jobsOf.get(j.enquiry_id) ?? []), j]);

  const rank = (c: FoundCustomer) =>
    customerRank(q, refs, { name: c.name, ref: refOf.get(c.id) ?? null, jobRefs: (jobsOf.get(c.id) ?? []).map((j) => j.project_ref) });
  const customers = list
    .map((c) => ({ c, name: nameRank(q, c.name), rank: rank(c) }))
    .sort((a, b) => a.name - b.name || a.rank - b.rank || b.c.created_at.localeCompare(a.c.created_at))
    .map(({ c }) => {
      const theirs = (jobsOf.get(c.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const latest = theirs[0];
      return {
        id: c.id,
        name: c.name,
        email: c.email || null,
        phone: c.phone,
        postcode: c.postcode,
        customer_ref: refOf.get(c.id) ?? null,
        projects: theirs.length,
        latest: latest ? { address: latest.address, postcode: latest.postcode, products: latest.products ?? [] } : null,
        possible_duplicate: dupes.get(c.id)?.[0] ?? null,
        was: c.was ?? null,
      };
    });
  return json({ customers: withContacts ? [...customers, ...(await contactMatches(db, q, customers))] : customers });
}

/**
 * People added under CRM › Contacts who match the search and are not already one of the customers found (same
 * mobile or email), so "+ New opportunity" can start a job for them. Their id is the contact's, flagged `contact`.
 */
async function contactMatches(db: ReturnType<typeof createAdminClient>, q: string, have: { phone: string | null; email: string | null }[]) {
  try {
    const words = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
    let query = db.from('crm_contacts').select('id, name, mobile, email, organisation_id').limit(8);
    for (const w of words) query = query.ilike('name', `%${w.replace(/[%_,]/g, '')}%`);
    const { data } = await query;
    const seen = new Set(have.flatMap((h) => [h.phone?.replace(/\D/g, ''), h.email?.toLowerCase()]).filter(Boolean) as string[]);
    return (data ?? [])
      .filter((c) => !(c.mobile && seen.has(String(c.mobile).replace(/\D/g, ''))) && !(c.email && seen.has(String(c.email).toLowerCase())))
      .map((c) => ({ id: c.id as string, name: c.name as string, email: (c.email as string | null) || null, phone: (c.mobile as string | null) || null, postcode: null, customer_ref: null, projects: 0, latest: null, possible_duplicate: null, was: null, contact: true }));
  } catch {
    return [];
  }
}
