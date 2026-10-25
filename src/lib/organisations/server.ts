import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { schemaReady } from '@/lib/schema-ready';
import { everyGroup, searchWords } from '@/lib/search-words';
import { toWaId } from '@/lib/whatsapp/shared';
import { nextPrimary, orgWordFilter, sortContacts, type JobContact, type JobOrganisation, type OrgContact, type Organisation, type OrgJob, type OrgListRow } from './shared';

/**
 * Organisations on the server (supabase/organisations.sql): the list with its counts, one organisation
 * with its contacts and jobs, the primary contact, linking a job, the global search's part, and
 * removing one. Contacts (their own list and page, moving one between organisations) are in
 * contacts-server.ts. Every function takes the database client, so scripts/test-orgs-api.mjs can hand
 * it a stand-in.
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
    every<OrgContact>((f, t) => db.from('crm_contacts').select('id, organisation_id, name, role, mobile, email, is_primary').order('id').range(f, t)),
    every<Row>((f, t) => db.from('crm_projects').select('id, organisation_id, stage').not('organisation_id', 'is', null).order('id').range(f, t)),
  ]);
  const peopleOf = new Map<string, OrgContact[]>();
  for (const c of contacts) if (c.organisation_id) peopleOf.set(c.organisation_id, [...(peopleOf.get(c.organisation_id) ?? []), c]);
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

/** A job's lines on an organisation's or a contact's page: open ones first, newest first, with the customer's name. */
export async function toOrgJobs(db: Db, rows: Row[]): Promise<OrgJob[]> {
  const ids = [...new Set(rows.map((j) => String(j.enquiry_id)))];
  const { data: people } = ids.length ? await db.from('enquiries').select('id, name').in('id', ids) : { data: [] as Row[] };
  const nameOf = new Map((people ?? []).map((p) => [String(p.id), String(p.name ?? '')]));
  return rows
    .map((j) => ({
      id: String(j.id),
      title: String(j.title ?? '') || 'Job',
      stage: String(j.stage),
      ref: typeof j.project_ref === 'string' ? j.project_ref : null,
      customer: nameOf.get(String(j.enquiry_id)) || null,
      contact_id: typeof j.contact_id === 'string' ? j.contact_id : null,
      postcode: typeof j.postcode === 'string' ? j.postcode : null,
      created_at: String(j.created_at),
    }))
    .sort((a, b) => Number(isOpen(b.stage)) - Number(isOpen(a.stage)) || b.created_at.localeCompare(a.created_at));
}

/** One organisation, its contacts (primary first) and its jobs (open ones first, newest first); null when it isn't there. */
export async function readOrganisation(db: Db, id: string): Promise<{ organisation: Organisation; contacts: OrgContact[]; jobs: OrgJob[] } | null> {
  const [{ data: org, error }, { data: contacts }, { data: jobRows }] = await Promise.all([
    db.from('organisations').select(ORG_COLS).eq('id', id).maybeSingle(),
    db.from('crm_contacts').select(CONTACT_COLS).eq('organisation_id', id).limit(500),
    db.from('crm_projects').select('*').eq('organisation_id', id).order('created_at', { ascending: false }).limit(500),
  ]);
  if (error) throw new Error(error.message);
  if (!org) return null;
  const jobs = await toOrgJobs(db, (jobRows ?? []) as Row[]);
  return { organisation: org as Organisation, contacts: await withChats(db, sortContacts((contacts ?? []) as OrgContact[])), jobs };
}

/**
 * Each contact's WhatsApp chat in the CRM, when their number has one (it's on a customer record:
 * WhatsApp is matched on the number, as everywhere). The newest chat on that number wins.
 */
export async function withChats(db: Db, contacts: OrgContact[]): Promise<OrgContact[]> {
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
  const off = await db.from('crm_contacts').update({ is_primary: false, updated_at: now }).eq('organisation_id', orgId).eq('is_primary', true).neq('id', contactId).select('id');
  if (off.error) return { ok: false, error: off.error.message };
  const on = await db.from('crm_contacts').update({ is_primary: true, updated_at: now }).eq('organisation_id', orgId).eq('id', contactId).select('id');
  if (on.error) return { ok: false, error: on.error.code === '23505' ? 'Someone else changed the primary contact just now. Try again.' : on.error.message };
  // Removed meanwhile: the one who was primary is again, so the organisation isn't left without one.
  if (!on.data?.length) {
    const was = off.data?.[0]?.id;
    if (was) await db.from('crm_contacts').update({ is_primary: true }).eq('organisation_id', orgId).eq('id', was);
    else await promoteNext(db, orgId);
    return { ok: false, error: 'That contact isn’t there any more.' };
  }
  return { ok: true };
}

/** After the primary contact is removed: the one added first of those left becomes primary. Its name, or null. */
export async function promoteNext(db: Db, orgId: string): Promise<string | null> {
  const { data } = await db.from('crm_contacts').select('id, name, is_primary, created_at').eq('organisation_id', orgId).limit(500);
  const left = (data ?? []) as Pick<OrgContact, 'id' | 'name' | 'is_primary' | 'created_at'>[];
  if (!left.length || left.some((c) => c.is_primary)) return null;
  const next = nextPrimary(left);
  if (!next) return null;
  const r = await setPrimary(db, orgId, next.id);
  return r.ok ? next.name : null;
}

/** The record page's Organisation card for a job (crm_projects row read with *): its organisation and that organisation's contacts; null when it has none. */
export async function jobOrganisation(db: Db, project: Row): Promise<JobOrganisation | null> {
  const orgId = typeof project.organisation_id === 'string' ? project.organisation_id : null;
  if (!orgId) return null;
  const [{ data: org }, { data: contacts }] = await Promise.all([
    db.from('organisations').select('id, name, type, phone, email').eq('id', orgId).maybeSingle(),
    db.from('crm_contacts').select(CONTACT_COLS).eq('organisation_id', orgId).limit(500),
  ]);
  if (!org) return null;
  const contactId = typeof project.contact_id === 'string' ? project.contact_id : null;
  const list = sortContacts((contacts ?? []) as OrgContact[]);
  return { ...(org as Omit<JobOrganisation, 'contacts' | 'contact_id'>), contacts: list, contact_id: list.some((c) => c.id === contactId) ? contactId : null };
}

/** The person a job is dealt with through (in its organisation, or on their own); null when none is linked. */
export async function jobContact(db: Db, project: Row): Promise<JobContact | null> {
  const id = typeof project.contact_id === 'string' ? project.contact_id : null;
  if (!id) return null;
  const { data: c } = await db.from('crm_contacts').select('id, name, role, mobile, email, organisation_id').eq('id', id).maybeSingle();
  if (!c) return null;
  const orgId = typeof c.organisation_id === 'string' ? c.organisation_id : null;
  const { data: org } = orgId ? await db.from('organisations').select('name').eq('id', orgId).maybeSingle() : { data: null };
  return { id: String(c.id), name: String(c.name), role: (c.role as string | null) ?? null, mobile: (c.mobile as string | null) ?? null, email: (c.email as string | null) ?? null, organisation_id: orgId, organisation_name: (org?.name as string | null) ?? null };
}

/** Both for the record page's card. */
export async function jobLinks(db: Db, project: Row): Promise<{ organisation: JobOrganisation | null; contact: JobContact | null }> {
  const [organisation, contact] = await Promise.all([jobOrganisation(db, project), jobContact(db, project)]);
  return { organisation, contact };
}

export type LinkResult = { ok: true; organisation: JobOrganisation | null; contact: JobContact | null } | { ok: false; status: number; error: string };

/**
 * Link a job to an organisation and/or the contact it's dealt with through. For each, `undefined` leaves
 * what the job has, `null` clears it and an id sets it; both null unlinks the job from both.
 * - A contact in an organisation brings the organisation with them (pick the person, and it's their
 *   organisation's job too); naming a different organisation than theirs is refused.
 * - A contact on their own can go with any organisation, or none.
 * - A contact who isn't in the job's organisation (it changed, or was cleared) is let go with it.
 * Says so on the job's timeline, and moves the job's updated_at so anyone with it open sees the change.
 */
export async function linkJob(db: Db, projectId: string, orgIn: string | null | undefined, contactIn: string | null | undefined, byId: string): Promise<LinkResult> {
  const { data: job } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  if (!job) return { ok: false, status: 404, error: 'That job isn’t there any more.' };
  const wasOrg = typeof job.organisation_id === 'string' ? job.organisation_id : null;
  const wasContact = typeof job.contact_id === 'string' ? job.contact_id : null;
  let orgId = orgIn === undefined ? wasOrg : orgIn;
  let contactId = contactIn === undefined ? wasContact : contactIn;

  // The contact: who they are, and the organisation they're in.
  let contactName = '';
  let theirOrg: string | null = null;
  if (contactId) {
    const { data: c } = await db.from('crm_contacts').select('id, name, organisation_id').eq('id', contactId).maybeSingle();
    if (!c) {
      if (contactIn) return { ok: false, status: 404, error: 'That contact isn’t there any more.' };
      contactId = null; // the job's own contact went meanwhile
    } else {
      contactName = String(c.name);
      theirOrg = typeof c.organisation_id === 'string' ? c.organisation_id : null;
    }
  }
  if (contactId && theirOrg) {
    if (contactIn && orgIn && orgIn !== theirOrg) {
      const { data: o } = await db.from('organisations').select('name').eq('id', orgIn).maybeSingle();
      return { ok: false, status: 400, error: `${contactName} isn’t one of ${o?.name ?? 'that organisation'}’s contacts.` };
    }
    // Picking them (or keeping them) puts the job with their organisation; changing the organisation away from theirs lets them go.
    if (contactIn) orgId = theirOrg;
    else if (orgId !== theirOrg) {
      contactId = null;
      contactName = '';
    }
  }
  let orgName = '';
  if (orgId) {
    const { data: org } = await db.from('organisations').select('id, name').eq('id', orgId).maybeSingle();
    if (!org) {
      if (orgIn || (contactIn && theirOrg)) return { ok: false, status: 404, error: 'That organisation isn’t there any more.' };
      orgId = null;
    } else orgName = String(org.name);
  }

  if (wasOrg === orgId && wasContact === contactId) return { ok: true, ...(await jobLinks(db, job)) };

  // Only if the job still has the contact it had when this started: a contact moved to another
  // organisation meanwhile (which re-points their jobs) mustn't be overwritten by a stale read.
  const guarded = db.from('crm_projects').update({ organisation_id: orgId, contact_id: contactId, updated_at: new Date().toISOString() }).eq('id', projectId);
  const { data: saved, error } = await (wasContact ? guarded.eq('contact_id', wasContact) : guarded.is('contact_id', null)).select('*').maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!saved) {
    const { data: still } = await db.from('crm_projects').select('id').eq('id', projectId).maybeSingle();
    return still ? { ok: false, status: 409, error: 'Someone changed this job just now. Try again.' } : { ok: false, status: 404, error: 'That job isn’t there any more.' };
  }

  const nameOf = async (table: 'organisations' | 'crm_contacts', id: string | null) => (id ? ((await db.from(table).select('name').eq('id', id).maybeSingle()).data?.name as string | undefined) : undefined);
  let body: string;
  if (orgId && wasOrg !== orgId) body = `Linked to ${orgName}${contactName ? ` (contact: ${contactName})` : ''}`;
  else if (orgId) body = contactName ? `Contact at ${orgName}: ${contactName}` : `No contact at ${orgName} for this job`;
  else if (wasOrg) body = `No longer linked to ${(await nameOf('organisations', wasOrg)) ?? 'an organisation'}${contactId && contactId === wasContact ? ` (still dealing with ${contactName})` : ''}`;
  else if (contactId) body = `Dealing with ${contactName}`;
  else body = `No longer dealing with ${(await nameOf('crm_contacts', wasContact)) ?? 'a contact'}`;
  await logActivity({ enquiryId: String(job.enquiry_id), projectId, kind: 'system', body, byId }).catch(() => null);
  return { ok: true, ...(await jobLinks(db, saved)) };
}

/**
 * Delete an organisation. Its contacts stay, on their own (a person doesn't vanish because their
 * organisation's record did), and its jobs are unlinked (set null), each with a line on its timeline.
 * Returns how many jobs and contacts were affected, or null when it wasn't there.
 */
export async function deleteOrganisation(db: Db, id: string, byId: string): Promise<{ jobs: number; contacts: number; name: string } | null> {
  const { data: org } = await db.from('organisations').select('id, name').eq('id', id).maybeSingle();
  if (!org) return null;
  const { data: jobs } = await db.from('crm_projects').select('id, enquiry_id').eq('organisation_id', id).limit(5000);
  // Nobody is "primary" in no organisation: unmarked first, then the foreign key lets them go.
  const { data: people } = await db.from('crm_contacts').update({ is_primary: false, updated_at: new Date().toISOString() }).eq('organisation_id', id).select('id');
  const { error } = await db.from('organisations').delete().eq('id', id);
  if (error) {
    // Not deleted: whoever was primary is again (the unmark above shouldn't stand).
    await promoteNext(db, id);
    throw new Error(error.message);
  }
  for (const j of (jobs ?? []) as Row[]) {
    await logActivity({ enquiryId: String(j.enquiry_id), projectId: String(j.id), kind: 'system', body: `No longer linked to ${org.name} (the organisation was deleted)`, byId }).catch(() => null);
  }
  return { jobs: jobs?.length ?? 0, contacts: people?.length ?? 0, name: String(org.name) };
}

/* ── The global search's part ─────────────────────────────────────────────────── */

/** An organisation, or a contact (with their organisation, if they're in one), found by search. */
export type SearchHit =
  | { kind: 'org'; id: string; name: string; type: string; postcode: string | null }
  | { kind: 'contact'; id: string; name: string; role: string | null; organisation: { id: string; name: string } | null };

/**
 * Organisations whose every word turns up on them (name, postcode, email, phone, company number), and
 * contacts whose every word turns up on them (name, role, email, mobile). Up to `limit` of each kind.
 * `q` must already be through cleanSearch. Never throws: before organisations.sql (or on any error) it's
 * an empty list.
 */
export async function searchOrgsAndContacts(db: Db, q: string, limit = 6): Promise<SearchHit[]> {
  const words = searchWords(q);
  if (!words.length) return [];
  try {
    const [orgs, contacts] = await Promise.all([
      db.from('organisations').select('id, name, type, postcode').or(everyGroup(words.map((w) => orgWordFilter(w, 'org')))).order('name').limit(limit),
      db.from('crm_contacts').select('id, organisation_id, name, role').or(everyGroup(words.map((w) => orgWordFilter(w, 'contact')))).order('name').limit(limit),
    ]);
    const people = (contacts.error ? [] : (contacts.data ?? [])) as Row[];
    const orgIds = [...new Set(people.map((c) => c.organisation_id).filter((x): x is string => typeof x === 'string'))];
    const { data: owners } = orgIds.length ? await db.from('organisations').select('id, name').in('id', orgIds) : { data: [] as Row[] };
    const ownerOf = new Map(((owners ?? []) as Row[]).map((o) => [String(o.id), String(o.name)]));
    return [
      ...((orgs.error ? [] : (orgs.data ?? [])) as Row[]).map((o): SearchHit => ({ kind: 'org', id: String(o.id), name: String(o.name), type: String(o.type), postcode: (o.postcode as string | null) ?? null })),
      ...people.map(
        (c): SearchHit => ({
          kind: 'contact',
          id: String(c.id),
          name: String(c.name),
          role: (c.role as string | null) ?? null,
          organisation: typeof c.organisation_id === 'string' && ownerOf.has(c.organisation_id) ? { id: c.organisation_id, name: ownerOf.get(c.organisation_id)! } : null,
        })
      ),
    ];
  } catch {
    return [];
  }
}
