import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { schemaReady } from '@/lib/schema-ready';
import { everyGroup, searchWords } from '@/lib/search-words';
import { toWaId } from '@/lib/whatsapp/shared';
import { nextPrimary, orgWordFilter, sortContacts, type JobOrganisation, type OrgContact, type Organisation, type OrgJob, type OrgListRow } from './shared';

/**
 * Organisations on the server (supabase/organisations.sql): the list with its counts, one organisation
 * with its contacts and jobs, the primary contact, linking a job, the global search's part, and
 * removing one. Every function takes the database client, so scripts/test-orgs-api.mjs can hand it a
 * stand-in.
 */

export type Db = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;

export const NOT_READY = 'Organisations are switched on once organisations.sql has been run: it’s on your to-do list.';
export const ORG_COLS = 'id, name, type, phone, email, website, address, postcode, company_number, vat_number, notes, created_at, updated_at';
export const CONTACT_COLS = 'id, organisation_id, name, role, mobile, email, notes, is_primary, created_at';

/** Is organisations.sql in (schemaReady's 60-second answer)? */
export async function orgsReady(): Promise<boolean> {
  return (await schemaReady()).organisations;
}

const PAGE = 1000;
/** Every row of a read, a page at a time (PostgREST gives at most 1,000 at once). */
async function every<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error((error as { message?: string }).message || 'Couldn’t read the organisations.');
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

const isOpen = (stage: unknown) => stage !== 'complete' && stage !== 'lost';

/** Every organisation, A to Z, with its contacts' and jobs' counts and its primary contact. */
export async function listOrganisations(db: Db): Promise<OrgListRow[]> {
  const [orgs, contacts, jobs] = await Promise.all([
    every<Organisation>((f, t) => db.from('organisations').select(ORG_COLS).order('name').range(f, t)),
    every<OrgContact>((f, t) => db.from('organisation_contacts').select('id, organisation_id, name, role, mobile, email, is_primary').order('id').range(f, t)),
    every<Row>((f, t) => db.from('crm_projects').select('id, organisation_id, stage').not('organisation_id', 'is', null).order('id').range(f, t)),
  ]);
  const peopleOf = new Map<string, OrgContact[]>();
  for (const c of contacts) peopleOf.set(c.organisation_id, [...(peopleOf.get(c.organisation_id) ?? []), c]);
  const jobsOf = new Map<string, { n: number; open: number }>();
  for (const j of jobs) {
    const k = String(j.organisation_id);
    const n = jobsOf.get(k) ?? { n: 0, open: 0 };
    jobsOf.set(k, { n: n.n + 1, open: n.open + Number(isOpen(j.stage)) });
  }
  return orgs.map((o) => {
    const people = peopleOf.get(o.id) ?? [];
    const p = people.find((c) => c.is_primary) ?? null;
    return {
      ...o,
      contacts: people.length,
      jobs: jobsOf.get(o.id)?.n ?? 0,
      open_jobs: jobsOf.get(o.id)?.open ?? 0,
      primary: p ? { id: p.id, name: p.name, role: p.role, mobile: p.mobile, email: p.email } : null,
      people: people.map((c) => [c.name, c.role, c.email].filter(Boolean).join(' ')),
    };
  });
}

/** One organisation, its contacts (primary first) and its jobs (open ones first, newest first); null when it isn't there. */
export async function readOrganisation(db: Db, id: string): Promise<{ organisation: Organisation; contacts: OrgContact[]; jobs: OrgJob[] } | null> {
  const [{ data: org, error }, { data: contacts }, { data: jobRows }] = await Promise.all([
    db.from('organisations').select(ORG_COLS).eq('id', id).maybeSingle(),
    db.from('organisation_contacts').select(CONTACT_COLS).eq('organisation_id', id).limit(500),
    db.from('crm_projects').select('*').eq('organisation_id', id).order('created_at', { ascending: false }).limit(500),
  ]);
  if (error) throw new Error(error.message);
  if (!org) return null;
  const rows = (jobRows ?? []) as Row[];
  const ids = [...new Set(rows.map((j) => String(j.enquiry_id)))];
  const { data: people } = ids.length ? await db.from('enquiries').select('id, name').in('id', ids) : { data: [] as Row[] };
  const nameOf = new Map((people ?? []).map((p) => [String(p.id), String(p.name ?? '')]));
  const jobs: OrgJob[] = rows
    .map((j) => ({
      id: String(j.id),
      title: String(j.title ?? '') || 'Job',
      stage: String(j.stage),
      ref: typeof j.project_ref === 'string' ? j.project_ref : null,
      customer: nameOf.get(String(j.enquiry_id)) || null,
      contact_id: typeof j.organisation_contact_id === 'string' ? j.organisation_contact_id : null,
      postcode: typeof j.postcode === 'string' ? j.postcode : null,
      created_at: String(j.created_at),
    }))
    .sort((a, b) => Number(isOpen(b.stage)) - Number(isOpen(a.stage)) || b.created_at.localeCompare(a.created_at));
  return { organisation: org as Organisation, contacts: await withChats(db, sortContacts((contacts ?? []) as OrgContact[])), jobs };
}

/**
 * Each contact's WhatsApp chat in the CRM, when their number has one (it's on a customer record:
 * WhatsApp is matched on the number, as everywhere). The newest chat on that number wins.
 */
async function withChats(db: Db, contacts: OrgContact[]): Promise<OrgContact[]> {
  const ids = [...new Set(contacts.map((c) => toWaId(c.mobile)).filter((x): x is string => !!x))];
  if (!ids.length) return contacts.map((c) => ({ ...c, chat_id: null }));
  const { data } = await db.from('enquiries').select('id, wa_id, wa_last_message_at').in('wa_id', ids).order('wa_last_message_at', { ascending: false, nullsFirst: false }).limit(200);
  const chatOf = new Map<string, string>();
  for (const e of (data ?? []) as Row[]) if (!chatOf.has(String(e.wa_id))) chatOf.set(String(e.wa_id), String(e.id));
  return contacts.map((c) => ({ ...c, chat_id: chatOf.get(toWaId(c.mobile) ?? '') ?? null }));
}

/**
 * Make `contactId` the organisation's primary contact. The others are unmarked first (one primary per
 * organisation is a unique index), so two people doing it at once can clash: that's said, not hidden.
 */
export async function setPrimary(db: Db, orgId: string, contactId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const off = await db.from('organisation_contacts').update({ is_primary: false, updated_at: now }).eq('organisation_id', orgId).eq('is_primary', true).neq('id', contactId).select('id');
  if (off.error) return { ok: false, error: off.error.message };
  const on = await db.from('organisation_contacts').update({ is_primary: true, updated_at: now }).eq('organisation_id', orgId).eq('id', contactId).select('id');
  if (on.error) return { ok: false, error: on.error.code === '23505' ? 'Someone else changed the primary contact just now. Try again.' : on.error.message };
  // Removed meanwhile: the one who was primary is again, so the organisation isn't left without one.
  if (!on.data?.length) {
    const was = off.data?.[0]?.id;
    if (was) await db.from('organisation_contacts').update({ is_primary: true }).eq('organisation_id', orgId).eq('id', was);
    else await promoteNext(db, orgId);
    return { ok: false, error: 'That contact isn’t there any more.' };
  }
  return { ok: true };
}

/** After the primary contact is removed: the one added first of those left becomes primary. Its name, or null. */
export async function promoteNext(db: Db, orgId: string): Promise<string | null> {
  const { data } = await db.from('organisation_contacts').select('id, name, is_primary, created_at').eq('organisation_id', orgId).limit(500);
  const left = (data ?? []) as Pick<OrgContact, 'id' | 'name' | 'is_primary' | 'created_at'>[];
  if (!left.length || left.some((c) => c.is_primary)) return null;
  const next = nextPrimary(left);
  if (!next) return null;
  const r = await setPrimary(db, orgId, next.id);
  return r.ok ? next.name : null;
}

/** The record page's Organisation card for a job (crm_projects row read with *); null when it has none. */
export async function jobOrganisation(db: Db, project: Row): Promise<JobOrganisation | null> {
  const orgId = typeof project.organisation_id === 'string' ? project.organisation_id : null;
  if (!orgId) return null;
  const [{ data: org }, { data: contacts }] = await Promise.all([
    db.from('organisations').select('id, name, type, phone, email').eq('id', orgId).maybeSingle(),
    db.from('organisation_contacts').select(CONTACT_COLS).eq('organisation_id', orgId).limit(500),
  ]);
  if (!org) return null;
  const contactId = typeof project.organisation_contact_id === 'string' ? project.organisation_contact_id : null;
  const list = sortContacts((contacts ?? []) as OrgContact[]);
  return { ...(org as Omit<JobOrganisation, 'contacts' | 'contact_id'>), contacts: list, contact_id: list.some((c) => c.id === contactId) ? contactId : null };
}

/**
 * Link a job to an organisation and the contact it's dealt with through (`orgId` null unlinks it).
 * The contact must be one of that organisation's. Says so on the job's timeline, and moves the job's
 * updated_at so anyone with it open sees the change.
 */
export async function linkJob(
  db: Db,
  projectId: string,
  orgId: string | null,
  contactId: string | null,
  byId: string
): Promise<{ ok: true; organisation: JobOrganisation | null } | { ok: false; status: number; error: string }> {
  const { data: job } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  if (!job) return { ok: false, status: 404, error: 'That job isn’t there any more.' };
  let orgName = '';
  let contactName = '';
  if (orgId) {
    const { data: org } = await db.from('organisations').select('id, name').eq('id', orgId).maybeSingle();
    if (!org) return { ok: false, status: 404, error: 'That organisation isn’t there any more.' };
    orgName = String(org.name);
    if (contactId) {
      const { data: c } = await db.from('organisation_contacts').select('id, name, organisation_id').eq('id', contactId).maybeSingle();
      if (!c || c.organisation_id !== orgId) return { ok: false, status: 400, error: `That contact isn’t one of ${orgName}’s.` };
      contactName = String(c.name);
    }
  } else contactId = null;

  const wasOrg = typeof job.organisation_id === 'string' ? job.organisation_id : null;
  const wasContact = typeof job.organisation_contact_id === 'string' ? job.organisation_contact_id : null;
  if (wasOrg === orgId && wasContact === contactId) return { ok: true, organisation: await jobOrganisation(db, job) };

  const { data: saved, error } = await db
    .from('crm_projects')
    .update({ organisation_id: orgId, organisation_contact_id: contactId, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .select('*')
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!saved) return { ok: false, status: 404, error: 'That job isn’t there any more.' };

  let body: string;
  if (!orgId) {
    const { data: was } = wasOrg ? await db.from('organisations').select('name').eq('id', wasOrg).maybeSingle() : { data: null };
    body = `No longer linked to ${was?.name ?? 'an organisation'}`;
  } else if (wasOrg !== orgId) body = `Linked to ${orgName}${contactName ? ` (contact: ${contactName})` : ''}`;
  else body = contactName ? `Contact at ${orgName}: ${contactName}` : `No contact at ${orgName} for this job`;
  await logActivity({ enquiryId: String(job.enquiry_id), projectId, kind: 'system', body, byId }).catch(() => null);
  return { ok: true, organisation: await jobOrganisation(db, saved) };
}

/**
 * Delete an organisation: its contacts go with it (the foreign key cascades) and its jobs are unlinked
 * (set null), each with a line on its timeline. Returns how many jobs were unlinked, or null when it
 * wasn't there.
 */
export async function deleteOrganisation(db: Db, id: string, byId: string): Promise<{ jobs: number; name: string } | null> {
  const { data: org } = await db.from('organisations').select('id, name').eq('id', id).maybeSingle();
  if (!org) return null;
  const { data: jobs } = await db.from('crm_projects').select('id, enquiry_id').eq('organisation_id', id).limit(5000);
  const { error } = await db.from('organisations').delete().eq('id', id);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Row[]) {
    await logActivity({ enquiryId: String(j.enquiry_id), projectId: String(j.id), kind: 'system', body: `No longer linked to ${org.name} (the organisation was deleted)`, byId }).catch(() => null);
  }
  return { jobs: jobs?.length ?? 0, name: String(org.name) };
}

/* ── The global search's part ─────────────────────────────────────────────────── */

export type SearchOrgHit = { id: string; name: string; type: string; postcode: string | null; contact: { id: string; name: string; role: string | null } | null };

/**
 * Organisations whose every word turns up on them (name, postcode, email, phone, company number), and
 * contacts whose every word turns up on them (name, role, email, mobile), as their organisation with
 * that contact named. Up to `limit`. `q` must already be through cleanSearch. Never throws: before
 * organisations.sql (or on any error) it's an empty list.
 */
export async function searchOrganisations(db: Db, q: string, limit = 6): Promise<SearchOrgHit[]> {
  const words = searchWords(q);
  if (!words.length) return [];
  try {
    const [orgs, contacts] = await Promise.all([
      db.from('organisations').select('id, name, type, postcode').or(everyGroup(words.map((w) => orgWordFilter(w, 'org')))).order('name').limit(limit),
      db.from('organisation_contacts').select('id, organisation_id, name, role').or(everyGroup(words.map((w) => orgWordFilter(w, 'contact')))).order('name').limit(limit),
    ]);
    const hits = new Map<string, SearchOrgHit>();
    for (const o of (orgs.error ? [] : (orgs.data ?? [])) as Row[]) {
      hits.set(String(o.id), { id: String(o.id), name: String(o.name), type: String(o.type), postcode: (o.postcode as string | null) ?? null, contact: null });
    }
    const people = (contacts.error ? [] : (contacts.data ?? [])) as Row[];
    const missing = [...new Set(people.map((c) => String(c.organisation_id)).filter((id) => !hits.has(id)))];
    const { data: owners } = missing.length ? await db.from('organisations').select('id, name, type, postcode').in('id', missing) : { data: [] as Row[] };
    const ownerOf = new Map(((owners ?? []) as Row[]).map((o) => [String(o.id), o]));
    for (const c of people) {
      const o = ownerOf.get(String(c.organisation_id));
      if (!o || hits.size >= limit) continue;
      const key = `${o.id}:${c.id}`;
      hits.set(key, { id: String(o.id), name: String(o.name), type: String(o.type), postcode: (o.postcode as string | null) ?? null, contact: { id: String(c.id), name: String(c.name), role: (c.role as string | null) ?? null } });
    }
    return [...hits.values()].slice(0, limit);
  } catch {
    return [];
  }
}
