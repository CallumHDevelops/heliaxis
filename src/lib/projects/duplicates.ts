import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { toWaId } from '@/lib/whatsapp/shared';
import { chunks } from '@/lib/crm/delete-customer';
import { nameKey } from '@/lib/crm/name-key';

/**
 * Possible duplicates (spec 4.10): other customers with the same email, the same WhatsApp number or
 * the same phone number (07… and +44 … count as the same), the same first and last name, plus a website booking that matched an
 * existing customer (survey_bookings.duplicate_of). The other numbers and emails a merge kept on a
 * customer count too (crm_aliases), and people staff said aren't the same person are left alone
 * (crm_distinct_pairs, both from merge.sql). It's a badge for staff, with Merge… beside it
 * (src/lib/crm/merge.ts).
 *
 * Everyone's contact details are read once and kept for a minute, so the CRM board can show the badge
 * on every card without a search per customer. A merge starts it afresh (resetDuplicateIndex).
 */

export type Duplicate = {
  enquiry_id: string;
  name: string;
  project_ref: string | null;
  project_id: string | null;
  /** What they share: the same email, the same number, the same name (the weakest), or a website booking that matched them. */
  why?: 'email' | 'number' | 'name' | 'booking';
};

type Db = ReturnType<typeof createAdminClient>;
type Person = { id: string; name: string | null; email: string | null; phone: string | null; wa_id: string | null };
type Index = { at: number; byId: Map<string, Person>; byKey: Map<string, string[]>; extra: Map<string, string[]>; distinct: Set<string> };

const TTL = 60_000;
const PAGE = 1000;
let index: Index | null = null;
let pending: Promise<Index> | null = null;
/** Bumped by resetDuplicateIndex, so a read started before a merge doesn't come back as the index. */
let generation = 0;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What makes two customers look like the same person. */
function keysOf(p: Person): string[] {
  const keys: string[] = [];
  const email = (p.email ?? '').trim().toLowerCase();
  if (EMAIL.test(email)) keys.push(`e:${email}`);
  for (const n of new Set([toWaId(p.wa_id), toWaId(p.phone)])) if (n) keys.push(`n:${n}`);
  // Last, so an email or number match is what it says when there are both.
  const nm = nameKey(p.name);
  if (nm) keys.push(`nm:${nm}`);
  return keys;
}

async function readPeople(db: Db): Promise<Person[]> {
  const out: Person[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('enquiries').select('id, name, email, phone, wa_id').order('id').range(from, from + PAGE - 1);
    if (error) {
      // Before whatsapp.sql there's no wa_id: email and phone still work.
      if (from === 0 && /wa_id/.test(error.message ?? '')) {
        const again = await db.from('enquiries').select('id, name, email, phone').order('id').limit(5000);
        return ((again.data ?? []) as Omit<Person, 'wa_id'>[]).map((p) => ({ ...p, wa_id: null }));
      }
      return out;
    }
    out.push(...((data ?? []) as Person[]));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

/** The other numbers and emails kept on merged customers ("n:4477…", "e:jo@…" by customer), and the "not the same person" pairs. None before merge.sql. */
async function readMerged(db: Db): Promise<{ extra: Map<string, string[]>; distinct: Set<string> }> {
  const extra = new Map<string, string[]>();
  const distinct = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('crm_aliases').select('kind, value, enquiry_id').in('kind', ['phone', 'email']).order('value').range(from, from + PAGE - 1);
    if (error) break;
    for (const r of (data ?? []) as { kind: string; value: string; enquiry_id: string }[]) {
      extra.set(r.enquiry_id, [...(extra.get(r.enquiry_id) ?? []), `${r.kind === 'phone' ? 'n' : 'e'}:${r.value}`]);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }
  const { data: pairs } = await db.from('crm_distinct_pairs').select('a, b').limit(5000);
  for (const p of (pairs ?? []) as { a: string; b: string }[]) distinct.add(`${p.a}|${p.b}`);
  return { extra, distinct };
}

async function build(db: Db): Promise<Index> {
  const [people, merged] = await Promise.all([readPeople(db), readMerged(db)]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const byKey = new Map<string, string[]>();
  for (const p of people) for (const k of [...keysOf(p), ...(merged.extra.get(p.id) ?? [])]) byKey.set(k, [...new Set([...(byKey.get(k) ?? []), p.id])]);
  return { at: Date.now(), byId, byKey, ...merged };
}

/** After a merge: the next look reads everyone again. */
export function resetDuplicateIndex() {
  generation++;
  index = null;
  pending = null;
}

async function currentIndex(db: Db): Promise<Index> {
  if (index && Date.now() - index.at < TTL) return index;
  const gen = generation;
  pending ??= build(db)
    .then((i) => {
      if (gen === generation) index = i;
      return i;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Website bookings that matched an existing customer, both ways round. Nothing before survey-booking.sql. */
async function bookingLinks(db: Db, ids: string[]): Promise<[string, string][]> {
  const pairs: [string, string][] = [];
  for (const part of chunks(ids, 100)) {
    const list = part.join(',');
    const { data, error } = await db
      .from('survey_bookings')
      .select('enquiry_id, duplicate_of')
      .not('duplicate_of', 'is', null)
      .or(`enquiry_id.in.(${list}),duplicate_of.in.(${list})`)
      .limit(1000);
    if (error) return pairs;
    for (const r of (data ?? []) as { enquiry_id: string | null; duplicate_of: string | null }[]) {
      if (r.enquiry_id && r.duplicate_of && r.enquiry_id !== r.duplicate_of) pairs.push([r.enquiry_id, r.duplicate_of]);
    }
  }
  return pairs;
}

/** Each other customer's job to link to: their latest open one, else their latest. With its ref once crm-v3.sql has run. */
async function jobsOf(db: Db, enquiryIds: string[]): Promise<Map<string, { id: string; project_ref: string | null }>> {
  type Job = { id: string; enquiry_id: string; stage: string; created_at: string; project_ref?: string | null };
  const out = new Map<string, { id: string; project_ref: string | null }>();
  const rows: Job[] = [];
  for (const part of chunks(enquiryIds, 100)) {
    const read = (cols: string) => db.from('crm_projects').select(cols).in('enquiry_id', part).limit(1000);
    let r = await read('id, enquiry_id, stage, created_at, project_ref');
    if (r.error) r = await read('id, enquiry_id, stage, created_at');
    rows.push(...((r.data ?? []) as unknown as Job[]));
  }
  const open = (j: Job) => j.stage !== 'complete' && j.stage !== 'lost';
  rows.sort((a, b) => Number(open(b)) - Number(open(a)) || b.created_at.localeCompare(a.created_at));
  for (const j of rows) if (!out.has(j.enquiry_id)) out.set(j.enquiry_id, { id: j.id, project_ref: j.project_ref ?? null });
  return out;
}

/** For each of these customers, the others who look like the same person (empty lists are left out). Never throws. */
export async function possibleDuplicates(enquiryIds: string[]): Promise<Map<string, Duplicate[]>> {
  const result = new Map<string, Duplicate[]>();
  const ids = [...new Set(enquiryIds.filter(Boolean))];
  if (!ids.length) return result;
  try {
    const db = createAdminClient();
    const [idx, links] = await Promise.all([currentIndex(db), bookingLinks(db, ids)]);
    const others = new Map<string, Set<string>>();
    const why = new Map<string, Duplicate['why']>();
    const add = (a: string, b: string, w: Duplicate['why']) => {
      if (a === b || idx.distinct.has(a < b ? `${a}|${b}` : `${b}|${a}`)) return;
      others.set(a, (others.get(a) ?? new Set()).add(b));
      if (!why.has(`${a}|${b}`)) why.set(`${a}|${b}`, w);
    };
    for (const id of ids) {
      const p = idx.byId.get(id);
      if (p) for (const k of [...keysOf(p), ...(idx.extra.get(id) ?? [])]) for (const o of idx.byKey.get(k) ?? []) add(id, o, k.startsWith('e:') ? 'email' : k.startsWith('nm:') ? 'name' : 'number');
    }
    const wanted = new Set(ids);
    for (const [a, b] of links) {
      if (wanted.has(a)) add(a, b, 'booking');
      if (wanted.has(b)) add(b, a, 'booking');
    }
    if (!others.size) return result;

    const everyone = [...new Set([...others.values()].flatMap((s) => [...s]))];
    const jobs = await jobsOf(db, everyone);
    // Their names as they are now: someone added since the index was read (a booking duplicate) is
    // found, and someone merged or deleted since (another server's index can be a minute old) isn't.
    const names = new Map<string, string>();
    for (const part of chunks(everyone, 100)) {
      const { data } = await db.from('enquiries').select('id, name').in('id', part);
      for (const r of data ?? []) names.set(r.id as string, (r.name as string) || '');
    }
    for (const [id, set] of others) {
      const list = [...set]
        .filter((o) => names.has(o))
        .map((o) => ({
          enquiry_id: o,
          name: (names.get(o) ?? '').trim() || 'Unknown',
          project_ref: jobs.get(o)?.project_ref ?? null,
          project_id: jobs.get(o)?.id ?? null,
          why: why.get(`${id}|${o}`),
        }));
      if (list.length) result.set(id, list.slice(0, 5));
    }
  } catch {
    // A badge is never worth failing a page for.
  }
  return result;
}

export type DuplicateGroup = {
  /** What they share (the strongest of it). */
  why: 'email' | 'number' | 'name';
  people: { id: string; name: string; email: string | null; phone: string | null; postcode: string | null; source: string | null; created_at: string; project_id: string | null; project_ref: string | null; stage: string | null }[];
};

/** Every set of customers who look like the same person, for the review page (people staff said aren't the same are left out). Never throws. */
export async function duplicateGroups(): Promise<DuplicateGroup[]> {
  try {
    const db = createAdminClient();
    const idx = await currentIndex(db);
    const strength = { email: 0, number: 1, name: 2 } as const;
    // Union the people who share any key, remembering the strongest reason.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      const p = parent.get(x) ?? x;
      if (p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    const why = new Map<string, keyof typeof strength>();
    for (const [k, list] of idx.byKey) {
      const ids = list.filter((id) => idx.byId.has(id));
      if (ids.length < 2 || ids.length > 8) continue; // a key shared by many is a shared line or a common name, not a person twice
      const kind: keyof typeof strength = k.startsWith('e:') ? 'email' : k.startsWith('nm:') ? 'name' : 'number';
      // Pairs staff said are different don't join.
      const usable = ids.filter((a, i) => ids.slice(i + 1).some((b) => !idx.distinct.has(a < b ? `${a}|${b}` : `${b}|${a}`)) || ids.slice(0, i).some((b) => !idx.distinct.has(b < a ? `${b}|${a}` : `${a}|${b}`)));
      if (usable.length < 2) continue;
      for (const id of usable.slice(1)) parent.set(find(id), find(usable[0]));
      const root = find(usable[0]);
      if (!why.has(root) || strength[kind] < strength[why.get(root)!]) why.set(root, kind);
    }
    const groups = new Map<string, string[]>();
    for (const id of parent.keys()) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
    for (const [root, members] of groups) if (!members.includes(root)) members.push(root);
    const all = [...new Set([...groups.values()].flat())];
    if (!all.length) return [];
    const extra = new Map<string, { postcode: string | null; source: string | null; created_at: string }>();
    for (const part of chunks(all, 100)) {
      const { data } = await db.from('enquiries').select('id, postcode, source, created_at').in('id', part);
      for (const r of (data ?? []) as { id: string; postcode: string | null; source: string | null; created_at: string }[]) extra.set(r.id, r);
    }
    const jobs = await jobsOf(db, all);
    const out: DuplicateGroup[] = [];
    for (const [root, members] of groups) {
      const people = [...new Set(members)]
        .filter((id) => extra.has(id))
        .map((id) => {
          const p = idx.byId.get(id)!;
          const x = extra.get(id)!;
          return { id, name: (p.name ?? '').trim() || 'Unknown', email: p.email, phone: p.phone, postcode: x.postcode, source: x.source, created_at: x.created_at, project_id: jobs.get(id)?.id ?? null, project_ref: jobs.get(id)?.project_ref ?? null, stage: null };
        })
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (people.length > 1) out.push({ why: why.get(find(root)) ?? why.get(root) ?? 'name', people });
    }
    return out.sort((a, b) => strength[a.why] - strength[b.why] || b.people[b.people.length - 1].created_at.localeCompare(a.people[a.people.length - 1].created_at));
  } catch {
    return [];
  }
}
