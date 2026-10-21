import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { aliasValue, type AliasKind } from '@/lib/crm/merge-rules';
import { leadSourceLabel } from '@/lib/lead-source';

/**
 * What still finds a record after a merge (crm_aliases, supabase/merge.sql): an old customer or job id
 * or reference, another phone number or email, a Meta lead id, an old portal or booking link. Each
 * lookup is one exact read, and none of them ever throws: before merge.sql there's nothing to find.
 */

type Db = ReturnType<typeof createAdminClient>;
export type AliasHit = { enquiry_id: string; project_id: string | null; from_ref: string | null };

/** The record an old value now belongs to, or null. */
export async function mergedInto(kind: AliasKind, raw: unknown, db: Db = createAdminClient()): Promise<AliasHit | null> {
  const value = aliasValue(kind, raw);
  if (!value) return null;
  try {
    const { data, error } = await db.from('crm_aliases').select('enquiry_id, project_id, from_ref').eq('kind', kind).eq('value', value).maybeSingle();
    return error || !data ? null : (data as AliasHit);
  } catch {
    return null;
  }
}

/** A customer merged into another, by their other phone number, email or Meta lead id (in that order). */
export async function aliasCustomer(p: { phone?: string | null; email?: string | null; metaLeadId?: string | null }, db: Db = createAdminClient()) {
  if (p.metaLeadId) {
    const hit = await mergedInto('meta_lead', p.metaLeadId, db);
    if (hit) return { ...hit, via: 'meta_lead' as const };
  }
  if (p.phone) {
    const hit = await mergedInto('phone', p.phone, db);
    if (hit) return { ...hit, via: 'phone' as const };
  }
  if (p.email) {
    const hit = await mergedInto('email', p.email, db);
    if (hit) return { ...hit, via: 'email' as const };
  }
  return null;
}

/**
 * Search (src/lib/customer-search.ts): customers found by an old reference (by the patterns refPatterns
 * gives), or part of another number or email. → [{ id, was }], "was" being the old reference they matched.
 */
export async function aliasMatches(db: Db, q: string, refs: string[]): Promise<{ id: string; was: string | null }[]> {
  const ors = refs.flatMap((p) => [`and(kind.eq.customer_ref,value.ilike.${p})`, `and(kind.eq.job_ref,value.ilike.${p})`]);
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 6 && /^[\d\s+()-]+$/.test(q)) ors.push(`and(kind.eq.phone,value.like.*${digits.startsWith('0') ? `44${digits.slice(1)}` : digits}*)`);
  if (/@/.test(q) || /^[\w.+-]{3,}$/.test(q)) ors.push(`and(kind.eq.email,value.ilike.*${q.toLowerCase().replace(/[%*,()]/g, '')}*)`);
  if (!ors.length) return [];
  try {
    const { data, error } = await db.from('crm_aliases').select('enquiry_id, kind, value, from_ref').or(ors.join(',')).limit(20);
    if (error) return [];
    const out = new Map<string, string | null>();
    for (const r of (data ?? []) as { enquiry_id: string; kind: string; value: string; from_ref: string | null }[]) {
      if (!out.has(r.enquiry_id)) out.set(r.enquiry_id, r.kind.endsWith('_ref') ? r.value : r.from_ref);
    }
    return [...out].map(([id, was]) => ({ id, was }));
  } catch {
    return [];
  }
}

/**
 * A WhatsApp from a number kept on a merged customer (src/lib/whatsapp/inbox.ts, before a new customer
 * would be made): the message is theirs, and replies now go to that number (WhatsApp's 24-hour window is
 * per number and they've just opened it on this one). Their old reply number becomes an other number.
 * → their enquiry row, or null.
 */
export async function replyNumberFromAlias(db: Db, waId: string): Promise<Record<string, unknown> | null> {
  const hit = await mergedInto('phone', waId, db);
  if (!hit) return null;
  const { data: row } = await db.from('enquiries').select('*').eq('id', hit.enquiry_id).maybeSingle();
  if (!row) return null;
  const was = (row as { wa_id?: string | null }).wa_id ?? null;
  if (was === waId) return row as Record<string, unknown>;
  try {
    await db.from('enquiries').update({ wa_id: waId }).eq('id', hit.enquiry_id);
    // The old number stays findable; this one is their main WhatsApp number now, not an "other" one.
    if (was) await db.from('crm_aliases').upsert({ kind: 'phone', value: was, shown: shownNumber(was), enquiry_id: hit.enquiry_id, from_ref: null }, { onConflict: 'kind,value', ignoreDuplicates: true });
    await db.from('crm_aliases').delete().eq('kind', 'phone').eq('value', waId);
    const name = String((row as { name?: string }).name || 'They').split(/\s+/)[0];
    await logActivity({ enquiryId: hit.enquiry_id, kind: 'system', body: `${name} messaged from ${shownNumber(waId)}: replies now go to that number` });
  } catch {
    // The message is still saved on them; replies go to the number they had.
  }
  return { ...(row as Record<string, unknown>), wa_id: waId };
}

/** 447700900123 → "07700 900123". */
export const shownNumber = (wa: string) => (wa.startsWith('44') ? `0${wa.slice(2, 6)} ${wa.slice(6)}` : `+${wa}`);

/** The other numbers and emails kept on a customer, for their card. Empty before merge.sql. */
export async function otherContacts(db: Db, enquiryId: string): Promise<{ kind: 'phone' | 'email'; value: string; shown: string; from_ref: string | null }[]> {
  try {
    const { data, error } = await db.from('crm_aliases').select('kind, value, shown, from_ref, created_at').eq('enquiry_id', enquiryId).in('kind', ['phone', 'email']).order('created_at');
    if (error) return [];
    return ((data ?? []) as { kind: 'phone' | 'email'; value: string; shown: string | null; from_ref: string | null }[]).map((r) => ({
      kind: r.kind,
      value: r.value,
      shown: r.shown || (r.kind === 'phone' ? shownNumber(r.value) : r.value),
      from_ref: r.from_ref,
    }));
  } catch {
    return [];
  }
}

export type MergeExtras = {
  /** Leads of records merged into them: "Also came in via Meta ad · Video 4 on 3 Sep (HX-0069)". */
  alsoCameIn: { label: string; at: string | null; ref: string | null }[];
  /** Other numbers and emails kept for search and incoming messages. */
  otherNumbers: Awaited<ReturnType<typeof otherContacts>>;
};

/** What a merge left on a customer, for their card (the record page). Empty before merge.sql. */
export async function mergeExtras(db: Db, c: { id: string; source?: unknown; created_at?: unknown }): Promise<MergeExtras> {
  const [origins, otherNumbers] = await Promise.all([
    db
      .from('crm_lead_origins')
      .select('source, came_in_at, customer_ref')
      .eq('enquiry_id', c.id)
      .order('came_in_at')
      .limit(20)
      .then(
        (r) => (r.error ? [] : ((r.data ?? []) as { source: string; came_in_at: string | null; customer_ref: string | null }[])),
        () => []
      ),
    otherContacts(db, c.id),
  ]);
  // Not their own lead again (a credit swap writes it as an origin too), and each lead once.
  const own = (o: { source: string; came_in_at: string | null }) => o.source === c.source && !!o.came_in_at && Date.parse(o.came_in_at) === Date.parse(String(c.created_at));
  const seen = new Set<string>();
  const alsoCameIn = origins
    .filter((o) => !own(o) && !seen.has(`${o.source}|${o.came_in_at}`) && !!seen.add(`${o.source}|${o.came_in_at}`))
    .map((o) => ({ label: leadSourceLabel(o.source), at: o.came_in_at, ref: o.customer_ref }));
  return { alsoCameIn, otherNumbers };
}

/** Their other phone numbers, emails and Meta lead ids, for the deleted list (src/lib/crm/delete-customer.ts). */
export async function aliasContacts(db: Db, enquiryIds: string[]): Promise<Map<string, { phones: string[]; emails: string[]; metaLeads: string[] }>> {
  const out = new Map<string, { phones: string[]; emails: string[]; metaLeads: string[] }>();
  if (!enquiryIds.length) return out;
  try {
    const { data, error } = await db.from('crm_aliases').select('enquiry_id, kind, value').in('enquiry_id', enquiryIds).in('kind', ['phone', 'email', 'meta_lead']).limit(5000);
    if (error) return out;
    for (const r of (data ?? []) as { enquiry_id: string; kind: string; value: string }[]) {
      const e = out.get(r.enquiry_id) ?? { phones: [], emails: [], metaLeads: [] };
      if (r.kind === 'phone') e.phones.push(r.value);
      else if (r.kind === 'email') e.emails.push(r.value);
      else e.metaLeads.push(r.value);
      out.set(r.enquiry_id, e);
    }
  } catch {
    // Nothing kept: only their own details go on the list.
  }
  return out;
}
