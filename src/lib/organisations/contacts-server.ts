import 'server-only';
import { logActivity } from '@/lib/crm/server';
import {
  CONTACT_COLS,
  promoteNext,
  setPrimary,
  toOrgJobs,
  withChats,
  type Db,
} from './server';
import type { ContactFields, ContactWithOrg, OrgContact, OrgJob, OrgType, PersonRow } from './shared';

/**
 * Contacts on the server (supabase/organisations.sql): the people we deal with, each in an organisation or
 * on their own. The Contacts list (the people we added, and the customers who came in as enquiries), a
 * contact's page, adding one, changing one or moving them between organisations, and removing one.
 * Customers are never changed here: they're enquiries, with their own pages.
 */

type Row = Record<string, unknown>;
const PAGE = 1000;
const isOpen = (stage: unknown) => stage !== 'complete' && stage !== 'lost';
const str = (v: unknown) => (typeof v === 'string' ? v : null);

async function every<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error((error as { message?: string }).message || 'Couldn’t read the contacts.');
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

type OrgBrief = { id: string; name: string; type: OrgType };
async function orgBriefs(db: Db, ids: (string | null)[]): Promise<Map<string, OrgBrief>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const { data } = await db.from('organisations').select('id, name, type').in('id', want);
  return new Map(((data ?? []) as OrgBrief[]).map((o) => [o.id, o]));
}

/** Everyone we added (in an organisation or on their own), with how many jobs they're dealt with through. */
export async function listContacts(db: Db): Promise<PersonRow[]> {
  const [contacts, jobs, orgs] = await Promise.all([
    every<OrgContact>((f, t) => db.from('crm_contacts').select(CONTACT_COLS).order('id').range(f, t)),
    every<Row>((f, t) => db.from('crm_projects').select('id, contact_id, stage').not('contact_id', 'is', null).order('id').range(f, t)),
    every<OrgBrief>((f, t) => db.from('organisations').select('id, name, type').order('id').range(f, t)),
  ]);
  const orgOf = new Map(orgs.map((o) => [o.id, o]));
  const jobsOf = new Map<string, { n: number; open: number }>();
  for (const j of jobs) {
    const k = String(j.contact_id);
    const n = jobsOf.get(k) ?? { n: 0, open: 0 };
    jobsOf.set(k, { n: n.n + 1, open: n.open + Number(isOpen(j.stage)) });
  }
  return contacts.map((c) => ({
    kind: 'contact' as const,
    id: c.id,
    name: c.name,
    role: c.role,
    mobile: c.mobile,
    email: c.email,
    postcode: null,
    organisation: c.organisation_id ? (orgOf.get(c.organisation_id) ?? null) : null,
    jobs: jobsOf.get(c.id)?.n ?? 0,
    open_jobs: jobsOf.get(c.id)?.open ?? 0,
    href: `/admin/crm/contacts/${c.id}`,
  }));
}

/** One contact with their organisation, their WhatsApp chat (when their number has one) and the jobs they're dealt with through; null when they aren't there. */
export async function readContact(db: Db, id: string): Promise<{ contact: ContactWithOrg; jobs: OrgJob[] } | null> {
  const [{ data: c, error }, { data: jobRows }] = await Promise.all([
    db.from('crm_contacts').select(CONTACT_COLS).eq('id', id).maybeSingle(),
    db.from('crm_projects').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(500),
  ]);
  if (error) throw new Error(error.message);
  if (!c) return null;
  const [withChat] = await withChats(db, [c as OrgContact]);
  const org = (await orgBriefs(db, [(c as OrgContact).organisation_id])).get((c as OrgContact).organisation_id ?? '') ?? null;
  return { contact: { ...withChat, organisation: org }, jobs: await toOrgJobs(db, (jobRows ?? []) as Row[]) };
}

type Fail = { ok: false; status: number; error: string };
const NO_ORG: Fail = { ok: false, status: 404, error: 'That organisation isn’t there any more.' };
const NO_CONTACT: Fail = { ok: false, status: 404, error: 'That contact isn’t there any more.' };

/**
 * Add a contact: in an organisation (`orgId`) or on their own (null). The first contact an organisation
 * has is its primary contact; `primary` makes a later one primary too (only in an organisation).
 */
export async function createContact(
  db: Db,
  fields: ContactFields,
  orgId: string | null,
  primary: boolean,
  byId: string
): Promise<{ ok: true; contact: OrgContact; warning?: string } | Fail> {
  if (orgId) {
    const { data: org } = await db.from('organisations').select('id').eq('id', orgId).maybeSingle();
    if (!org) return NO_ORG;
  } else if (primary) return { ok: false, status: 400, error: 'Only a contact in an organisation can be its primary contact.' };
  const { is_primary: _ignored, ...rest } = fields;
  void _ignored;
  const { data, error } = await db
    .from('crm_contacts')
    .insert({ ...rest, organisation_id: orgId, is_primary: false, created_by: byId })
    .select(CONTACT_COLS)
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? 'Not saved. Try again.' };
  const contact = data as OrgContact;
  let warning: string | undefined;
  if (orgId) {
    const { count } = await db.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('is_primary', true);
    if (primary || !count) {
      const r = await setPrimary(db, orgId, contact.id);
      if (r.ok) contact.is_primary = true;
      else warning = `${contact.name} is saved, but not as the primary contact: ${r.error}`;
    }
    await db.from('organisations').update({ updated_at: new Date().toISOString() }).eq('id', orgId);
  }
  return { ok: true, contact, ...(warning ? { warning } : {}) };
}

/**
 * Change a contact. `move`: put them in another organisation (or, with orgId null, on their own). A move
 * unmarks them as primary, hands the old organisation's primary contact to the next one if it was them,
 * makes them the new organisation's primary if it has none, and takes the jobs they're dealt with
 * through along: those jobs are with the new organisation (or none) now, and say so on their timelines.
 * `fields.is_primary: true` makes them primary (only in an organisation).
 */
export async function updateContact(
  db: Db,
  id: string,
  fields: ContactFields,
  move: { orgId: string | null } | null,
  byId: string
): Promise<{ ok: true; contact: OrgContact; jobsMoved: number } | Fail> {
  const { data: was } = await db.from('crm_contacts').select(CONTACT_COLS).eq('id', id).maybeSingle();
  if (!was) return NO_CONTACT;
  const before = was as OrgContact;
  const { is_primary: makePrimary, ...rest } = fields;
  let orgId = before.organisation_id;
  let targetName = '';
  if (move && move.orgId !== orgId) {
    if (move.orgId) {
      const { data: org } = await db.from('organisations').select('id, name').eq('id', move.orgId).maybeSingle();
      if (!org) return NO_ORG;
      targetName = String(org.name);
    }
    orgId = move.orgId;
  }
  const moved = orgId !== before.organisation_id;
  if (makePrimary === true && !orgId) return { ok: false, status: 400, error: 'Only a contact in an organisation can be its primary contact.' };

  const patch: Row = { ...rest, updated_at: new Date().toISOString() };
  if (moved) {
    patch.organisation_id = orgId;
    patch.is_primary = false;
  }
  if (Object.keys(patch).length > 1) {
    const { error } = await db.from('crm_contacts').update(patch).eq('id', id);
    if (error) return { ok: false, status: 500, error: error.message };
  }

  let jobsMoved = 0;
  if (moved) {
    if (before.organisation_id && before.is_primary) await promoteNext(db, before.organisation_id);
    if (orgId) {
      const { count } = await db.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('is_primary', true);
      if (!count) await setPrimary(db, orgId, id);
    }
    const { data: jobs } = await db.from('crm_projects').select('id, enquiry_id, organisation_id').eq('contact_id', id).limit(2000);
    const name = String(rest.name ?? before.name);
    for (const j of (jobs ?? []) as Row[]) {
      if ((str(j.organisation_id) ?? null) === orgId) continue;
      const { error } = await db.from('crm_projects').update({ organisation_id: orgId, updated_at: new Date().toISOString() }).eq('id', String(j.id));
      if (error) continue;
      jobsMoved++;
      await logActivity({
        enquiryId: String(j.enquiry_id),
        projectId: String(j.id),
        kind: 'system',
        body: orgId ? `${name} is part of ${targetName} now: this job is linked to ${targetName}` : `${name} is on their own now: this job is no longer linked to an organisation`,
        byId,
      }).catch(() => null);
    }
  }
  if (makePrimary === true && orgId) {
    const r = await setPrimary(db, orgId, id);
    if (!r.ok) return { ok: false, status: 409, error: r.error };
  }
  for (const o of new Set([before.organisation_id, orgId])) if (o) await db.from('organisations').update({ updated_at: new Date().toISOString() }).eq('id', o);
  const { data: now } = await db.from('crm_contacts').select(CONTACT_COLS).eq('id', id).maybeSingle();
  return { ok: true, contact: (now ?? before) as OrgContact, jobsMoved };
}

/** Delete a contact. Jobs dealt with through them stay (and keep their organisation); if they were their organisation's primary contact, the next one takes over (that one's name, or null). */
export async function removeContact(db: Db, id: string): Promise<{ ok: true; primary: string | null } | Fail> {
  const { data: c } = await db.from('crm_contacts').select(CONTACT_COLS).eq('id', id).maybeSingle();
  if (!c) return NO_CONTACT;
  const was = c as OrgContact;
  const { error } = await db.from('crm_contacts').delete().eq('id', id);
  if (error) return { ok: false, status: 500, error: error.message };
  const primary = was.organisation_id && was.is_primary ? await promoteNext(db, was.organisation_id) : null;
  if (was.organisation_id) await db.from('organisations').update({ updated_at: new Date().toISOString() }).eq('id', was.organisation_id);
  return { ok: true, primary };
}
