import 'server-only';
import { postcodePattern } from '@/lib/global-search';
import { looksLikeRef, refMatches, refOnly, refPatterns } from '@/lib/projects/refs';
import { missingColumn, type Db } from '@/lib/projects/server';
import { accentPattern, everyGroup, searchWords, withoutAccents } from '@/lib/search-words';

/**
 * Finding customers by what someone typed, word by word (src/lib/search-words.ts): every word has to
 * be in their name, email, phone digits or postcode, or be a reference (HX-0042, hx42, 0042) once
 * customer-refs.sql has been run, their own or one of their jobs'. Shared by GET /api/crm/customers
 * (the New project sheet and the CRM search) and GET /api/search (the search on the dashboard and in
 * the header).
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
 * One word's alternatives: name (accents aside), email, postcode (with or without its space), phone
 * digits and WhatsApp number. None for "HX…", which is only ever a reference; "0042" could be part of a
 * number too.
 */
function wordFilter(w: string): string[] {
  if (refOnly(w)) return [];
  const ors = [`name.ilike.%${w}%`, `email.ilike.%${w}%`, `postcode.ilike.%${w}%`];
  const postcode = postcodePattern(w);
  if (postcode) ors.push(`postcode.ilike.${postcode}`);
  const digits = w.replace(/\D/g, '');
  if (digits.length >= 4 && /^[\d\s+-]+$/.test(w)) {
    // Phones are kept as typed, WhatsApp ids as digits (447700…).
    const intl = digits.startsWith('0') ? `44${digits.slice(1)}` : digits;
    ors.push(`phone.ilike.%${digits}%`, `wa_id.like.*${intl}*`);
    if (digits.length >= 6) ors.push(`phone.ilike.%${digits.slice(0, -6)}%${digits.slice(-6, -3)}%${digits.slice(-3)}%`);
  }
  const accents = accentPattern(w);
  if (accents) ors.push(`name.imatch.${accents}`);
  return ors;
}

type Read = { data: unknown[] | null; error: { code?: string; message?: string } | null };
const isWa = (o: string) => o.startsWith('wa_id');

/** A read filtered by these words, again without wa_id before whatsapp.sql, and without the accent patterns if they're refused. */
async function tolerant(groups: string[][], read: (groups: string[][]) => PromiseLike<Read>): Promise<Read> {
  let gs = groups;
  let r = await read(gs);
  if (r.error && missingColumn(r.error) && gs.some((g) => g.some(isWa))) r = await read((gs = gs.map((g) => g.filter((o) => !isWa(o)))));
  if (r.error && gs.some((g) => g.some((o) => o.includes('.imatch.')))) r = await read(withoutAccents(gs));
  return r;
}

/**
 * Up to `limit` customers matching `q` (already through cleanSearch, src/lib/global-search.ts): reference
 * matches first, then the newest whose every word matches. `refs` are the reference patterns used (empty
 * when no word is a reference), for customerRank. `error` is set when the main read failed.
 */
export async function findCustomers(db: Db, q: string, limit = 20): Promise<{ customers: FoundCustomer[]; refs: string[]; error: string | null }> {
  const found = new Map<string, FoundCustomer>();
  const keep = (rows: unknown[] | null | undefined) => {
    for (const r of (rows ?? []) as FoundCustomer[]) if (!found.has(r.id)) found.set(r.id, r);
  };
  const words = searchWords(q);
  const filters = words.map(wordFilter);

  // References: the customer's own, and any of their jobs'. Skipped if the columns aren't there yet. A
  // word that could be one (the first, if several could) is looked for there; the others narrow it down.
  const refWord = words.find((w) => looksLikeRef(w));
  const refs = refWord ? refPatterns(refWord) : [];
  const others = filters.filter((_, i) => words[i] !== refWord);
  if (refs.length && others.every((g) => g.length)) {
    const or = refs.map((p) => `customer_ref.ilike.${p}`).join(',');
    const [byCustomer, byJob] = await Promise.all([
      tolerant(others, (gs) => db.from('enquiries').select(`${COLS}, customer_ref`).or(everyGroup([or.split(','), ...gs])).limit(limit)),
      db
        .from('crm_projects')
        .select('enquiry_id, project_ref')
        .or(refs.map((p) => `project_ref.ilike.${p}`).join(','))
        .limit(limit),
    ]);
    if (!byCustomer.error) keep(byCustomer.data);
    if (!byJob.error && byJob.data?.length) {
      const ids = [...new Set(byJob.data.filter((j) => refMatches(refWord!, j.project_ref as string)).map((j) => j.enquiry_id as string))].filter((x) => !found.has(x));
      if (ids.length) {
        const owners = await tolerant(others, (gs) => {
          const read = db.from('enquiries').select(COLS).in('id', ids.slice(0, 100));
          return gs.length ? read.or(everyGroup(gs)) : read;
        });
        keep(owners.data);
      }
    }
  }

  // Everyone else whose every word matches. A word that's only ever a reference ("HX…") has been looked for above.
  if (words.length && filters.every((g) => g.length) && found.size < limit) {
    const r = await tolerant(filters, (gs) => db.from('enquiries').select(COLS).or(everyGroup(gs)).order('created_at', { ascending: false }).limit(limit));
    if (r.error) return { customers: [], refs, error: r.error.message ?? 'Search failed' };
    keep(r.data);
  }

  return { customers: [...found.values()].slice(0, limit), refs, error: null };
}
