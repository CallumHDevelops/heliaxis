import 'server-only';
import { findCustomers } from '@/lib/customer-search';
import { jobHref } from '@/lib/global-search';
import type { Db } from './server';
import type { PersonRow } from './shared';

/**
 * Customers (enquiries) as people for CRM › Contacts. Kept apart from contacts-server.ts so that
 * Metis's tools, which use that, don't load the whole customer search.
 */

type Row = Record<string, unknown>;
const isOpen = (stage: unknown) => stage !== 'complete' && stage !== 'lost';

const CUSTOMERS = 40;

/**
 * Customers (enquiries) as people: the ones `q` finds (word by word, as the CRM search does), or the
 * newest when nothing is typed. Each opens their latest job (open ones first), or their details on
 * Enquiries for those who can open that. `q` must already be through cleanSearch.
 */
export async function listCustomers(db: Db, q: string, canEnquiries: boolean): Promise<PersonRow[]> {
  let people: { id: string; name: string; email: string | null; phone: string | null; postcode: string | null }[];
  if (q.length >= 2) {
    const found = await findCustomers(db, q, CUSTOMERS);
    if (found.error) throw new Error(found.error);
    people = found.customers;
  } else {
    const { data, error } = await db.from('enquiries').select('id, name, email, phone, postcode').order('created_at', { ascending: false }).limit(CUSTOMERS);
    if (error) throw new Error(error.message);
    people = (data ?? []) as typeof people;
  }
  const ids = people.map((p) => p.id);
  const { data: jobRows } = ids.length ? await db.from('crm_projects').select('id, enquiry_id, stage, created_at').in('enquiry_id', ids).limit(2000) : { data: [] as Row[] };
  const jobsOf = new Map<string, Row[]>();
  for (const j of (jobRows ?? []) as Row[]) jobsOf.set(String(j.enquiry_id), [...(jobsOf.get(String(j.enquiry_id)) ?? []), j]);
  return people.map((p) => {
    const theirs = (jobsOf.get(p.id) ?? []).sort((a, b) => Number(isOpen(b.stage)) - Number(isOpen(a.stage)) || String(b.created_at).localeCompare(String(a.created_at)));
    const best = theirs[0];
    return {
      kind: 'customer' as const,
      id: p.id,
      name: p.name,
      role: null,
      mobile: p.phone,
      email: p.email || null,
      postcode: p.postcode,
      organisation: null,
      jobs: theirs.length,
      open_jobs: theirs.filter((j) => isOpen(j.stage)).length,
      href: best ? jobHref({ id: String(best.id), stage: String(best.stage) }) : canEnquiries ? `/admin/enquiries?open=${p.id}` : null,
    };
  });
}

