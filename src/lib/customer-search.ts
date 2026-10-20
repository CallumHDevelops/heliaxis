import 'server-only';
import { postcodePattern } from '@/lib/global-search';
import { looksLikeRef, refMatches, refOnly, refPatterns } from '@/lib/projects/refs';
import { missingColumn, type Db } from '@/lib/projects/server';

/**
 * Finding customers by what someone typed: name, email, phone digits, postcode, or a reference
 * (HX-0042, hx42, 0042) once customer-refs.sql has been run, their own or one of their jobs'. Shared by
 * GET /api/crm/customers (the New project sheet and the CRM search) and GET /api/search (the search
 * on the dashboard and in the header).
 */

export type FoundCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  created_at: string;
  customer_ref?: string | null;
};

const COLS = 'id, name, email, phone, postcode, created_at';

/**
 * Up to `limit` customers matching `q` (already through cleanSearch, src/lib/global-search.ts): reference
 * matches first, then the newest name, email, postcode and phone matches. `refs` are the reference
 * patterns used (empty when `q` isn't a reference), for customerRank. `error` is set when the main read failed.
 */
export async function findCustomers(db: Db, q: string, limit = 20): Promise<{ customers: FoundCustomer[]; refs: string[]; error: string | null }> {
  const found = new Map<string, FoundCustomer>();
  const keep = (rows: FoundCustomer[] | null | undefined) => {
    for (const r of rows ?? []) if (!found.has(r.id)) found.set(r.id, r);
  };

  // References: the customer's own, and any of their jobs'. Skipped if the columns aren't there yet.
  const refs = looksLikeRef(q) ? refPatterns(q) : [];
  if (refs.length) {
    const or = refs.map((p) => `customer_ref.ilike.${p}`).join(',');
    const [byCustomer, byJob] = await Promise.all([
      db.from('enquiries').select(`${COLS}, customer_ref`).or(or).limit(limit),
      db
        .from('crm_projects')
        .select('enquiry_id, project_ref')
        .or(refs.map((p) => `project_ref.ilike.${p}`).join(','))
        .limit(limit),
    ]);
    if (!byCustomer.error) keep(byCustomer.data as FoundCustomer[]);
    if (!byJob.error && byJob.data?.length) {
      const ids = [...new Set(byJob.data.filter((j) => refMatches(q, j.project_ref as string)).map((j) => j.enquiry_id as string))].filter((x) => !found.has(x));
      if (ids.length) keep((await db.from('enquiries').select(COLS).in('id', ids.slice(0, 100))).data as FoundCustomer[]);
    }
  }

  // Name, email, postcode and phone. "HX…" is only ever a reference; "0042" could be part of a number too.
  if (!refOnly(q) && found.size < limit) {
    const ors = [`name.ilike.%${q}%`, `email.ilike.%${q}%`, `postcode.ilike.%${q}%`];
    const postcode = postcodePattern(q);
    if (postcode) ors.push(`postcode.ilike.${postcode}`);
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 4 && /^[\d\s+-]+$/.test(q)) {
      // Phones are kept as typed, WhatsApp ids as digits (447700…).
      const intl = digits.startsWith('0') ? `44${digits.slice(1)}` : digits;
      ors.push(`phone.ilike.%${digits}%`, `wa_id.like.*${intl}*`);
      if (digits.length >= 6) ors.push(`phone.ilike.%${digits.slice(0, -6)}%${digits.slice(-6, -3)}%${digits.slice(-3)}%`);
    }
    let r = await db.from('enquiries').select(COLS).or(ors.join(',')).order('created_at', { ascending: false }).limit(limit);
    // Before whatsapp.sql there's no wa_id.
    if (r.error && missingColumn(r.error)) {
      r = await db
        .from('enquiries')
        .select(COLS)
        .or(ors.filter((o) => !o.startsWith('wa_id')).join(','))
        .order('created_at', { ascending: false })
        .limit(limit);
    }
    if (r.error) return { customers: [], refs, error: r.error.message };
    keep(r.data as FoundCustomer[]);
  }

  return { customers: [...found.values()].slice(0, limit), refs, error: null };
}
