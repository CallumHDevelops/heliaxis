import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { possibleDuplicates } from '@/lib/projects/duplicates';
import { looksLikeRef, refMatches, refOnly, refPatterns } from '@/lib/projects/refs';
import { missingColumn, readAll } from '@/lib/projects/server';

export const dynamic = 'force-dynamic';

const LIMIT = 20;
const COLS = 'id, name, email, phone, postcode, created_at';

type Customer = { id: string; name: string; email: string | null; phone: string | null; postcode: string | null; created_at: string; customer_ref?: string | null };
type Job = { id: string; enquiry_id: string; address: string | null; postcode: string | null; products: string[]; created_at: string; project_ref?: string | null };

/**
 * Customer search for the New project sheet and the CRM search: name, email, phone digits, postcode,
 * or a reference (HX-0042, hx42, 0042) once customer-refs.sql has been run. Up to 20, each with how
 * many jobs they have, their latest site address and a possible-duplicate flag.
 */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  // Characters that would change the meaning of a filter come out (spec 1).
  const q = (new URL(req.url).searchParams.get('q') ?? '').replace(/[,()%*\\"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return json({ customers: [] });
  const db = createAdminClient();

  const found = new Map<string, Customer>();
  const keep = (rows: Customer[] | null | undefined) => {
    for (const r of rows ?? []) if (!found.has(r.id)) found.set(r.id, r);
  };

  // References: the customer's own, and any of their jobs'. Skipped if the columns aren't there yet.
  const refs = looksLikeRef(q) ? refPatterns(q) : [];
  if (refs.length) {
    const or = refs.map((p) => `customer_ref.ilike.${p}`).join(',');
    const [byCustomer, byJob] = await Promise.all([
      db.from('enquiries').select(`${COLS}, customer_ref`).or(or).limit(LIMIT),
      db
        .from('crm_projects')
        .select('enquiry_id, project_ref')
        .or(refs.map((p) => `project_ref.ilike.${p}`).join(','))
        .limit(LIMIT),
    ]);
    if (!byCustomer.error) keep(byCustomer.data as Customer[]);
    if (!byJob.error && byJob.data?.length) {
      const ids = [...new Set(byJob.data.filter((j) => refMatches(q, j.project_ref as string)).map((j) => j.enquiry_id as string))].filter((x) => !found.has(x));
      if (ids.length) keep((await db.from('enquiries').select(COLS).in('id', ids.slice(0, 100))).data as Customer[]);
    }
  }

  // Name, email, postcode and phone. "HX…" is only ever a reference; "0042" could be part of a number too.
  if (!refOnly(q) && found.size < LIMIT) {
    const ors = [`name.ilike.%${q}%`, `email.ilike.%${q}%`, `postcode.ilike.%${q}%`];
    // A postcode typed with or without its space ("np204ab" finds NP20 4AB).
    const squashed = q.replace(/\s/g, '');
    if (/^[a-z]{1,2}\d[a-z\d]?\d[a-z]{2}$/i.test(squashed)) ors.push(`postcode.ilike.%${squashed.slice(0, -3)}%${squashed.slice(-3)}%`);
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 4 && /^[\d\s+-]+$/.test(q)) {
      // Phones are kept as typed, WhatsApp ids as digits (447700…).
      const intl = digits.startsWith('0') ? `44${digits.slice(1)}` : digits;
      ors.push(`phone.ilike.%${digits}%`, `wa_id.like.*${intl}*`);
      if (digits.length >= 6) ors.push(`phone.ilike.%${digits.slice(0, -6)}%${digits.slice(-6, -3)}%${digits.slice(-3)}%`);
    }
    let r = await db.from('enquiries').select(COLS).or(ors.join(',')).order('created_at', { ascending: false }).limit(LIMIT);
    // Before whatsapp.sql there's no wa_id.
    if (r.error && missingColumn(r.error)) {
      r = await db
        .from('enquiries')
        .select(COLS)
        .or(ors.filter((o) => !o.startsWith('wa_id')).join(','))
        .order('created_at', { ascending: false })
        .limit(LIMIT);
    }
    if (r.error) return json({ error: r.error.message, customers: [] }, 500);
    keep(r.data as Customer[]);
  }

  const list = [...found.values()].slice(0, LIMIT);
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

  const rank = (c: Customer) => {
    const ref = refOf.get(c.id) ?? null;
    if (refs.length && (refMatches(q, ref) || (jobsOf.get(c.id) ?? []).some((j) => refMatches(q, j.project_ref)))) return 0;
    return c.name.toLowerCase().startsWith(q.toLowerCase()) ? 1 : 2;
  };
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
