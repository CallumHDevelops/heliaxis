import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { findCustomers, type FoundCustomer } from '@/lib/customer-search';
import { cleanSearch, customerRank } from '@/lib/global-search';
import { possibleDuplicates } from '@/lib/projects/duplicates';
import { readAll } from '@/lib/projects/server';

export const dynamic = 'force-dynamic';

const LIMIT = 20;

type Job = { id: string; enquiry_id: string; address: string | null; postcode: string | null; products: string[]; created_at: string; project_ref?: string | null };

/**
 * Customer search for the New project sheet and the CRM search: name, email, phone digits, postcode,
 * or a reference (HX-0042, hx42, 0042) once customer-refs.sql has been run (src/lib/customer-search.ts).
 * Up to 20, each with how many jobs they have, their latest site address and a possible-duplicate flag.
 */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const q = cleanSearch(new URL(req.url).searchParams.get('q'));
  if (q.length < 2) return json({ customers: [] });
  const db = createAdminClient();

  const found = await findCustomers(db, q, LIMIT);
  if (found.error) return json({ error: found.error, customers: [] }, 500);
  const { refs } = found;
  const list = found.customers;
  const ids = list.map((c) => c.id);
  if (!ids.length) return json({ customers: [] });
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
    .map((c) => ({ c, rank: rank(c) }))
    .sort((a, b) => a.rank - b.rank || b.c.created_at.localeCompare(a.c.created_at))
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
      };
    });
  return json({ customers });
}
