import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { chatRef, leadRef, replyRef } from '@/lib/notification-refs';
import { toWaId } from '@/lib/whatsapp/shared';
import { mediaFilesOf } from '@/lib/whatsapp/media';
import { isOrdered } from '@/lib/purchase-orders/money';
import { CRM_BUCKET, DOCS_BUCKET, thumbPath } from './server';
import { aliasContacts } from './aliases';

/**
 * Deleting a customer for good: the enquiry and everything about it. Their opportunities and
 * timeline, WhatsApp chat (and anything still waiting to send), emails, tasks on their
 * opportunities, Metis's drafts and what her lookups found about them, the notifications about
 * them, and their photos, documents and signatures in storage. Admins only (the routes check).
 *
 * The database goes first, in one statement: deleting the enquiry rows takes every row that
 * references them or their opportunities with it (on delete cascade in crm.sql, crm-v2.sql,
 * whatsapp.sql and assistant.sql). Only the notifications, which link by text, are deleted by hand,
 * just before, and Metis's conversations are cleared just after. Files go last, so a storage
 * hiccup never leaves a half-deleted customer on screen; a file that won't go is logged with its
 * path. Safe to run twice: someone already gone counts as gone.
 *
 * Then a fingerprint of how an import would recognise them (Meta lead id, mobile, email) goes on
 * the deleted list (deleted-customers.sql), so Enquiries → Import skips them. Nothing else reads
 * it: a new live lead or WhatsApp message from them comes in as normal, and an import still brings
 * in anything they sent after being deleted. Without the table, deleting works the same and
 * imports just can't skip them.
 */

type Db = ReturnType<typeof createAdminClient>;
type DbError = { code?: string; message: string } | null;

export const MAX_DELETE = 200;
export const isCustomerId = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const LIST = 'crm_deleted_people';
const PAGE = 1000; // Supabase hands back at most 1,000 rows at a time
const IN_MAX = 100; // ids per filter, so the request URL stays short

export const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A table from a later SQL file isn't there yet (a missing column is a real error). Writes to a
 * missing table come back as a bare 404, with no message.
 */
export const notThere = (r: { error: DbError; status?: number }) =>
  !!r.error &&
  (r.status === 404 || ['42P01', 'PGRST205'].includes(r.error.code ?? '') || /relation .* does not exist|could not find the table/i.test(r.error.message ?? ''));

/** Every row of `table` whose `col` is one of `values`. Optional tables that aren't there yet have none. */
export async function rowsIn<T>(db: Db, table: string, cols: string, col: string, values: string[], optional = false): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunks(values, IN_MAX)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error, status } = await db.from(table).select(cols).in(col, part).order('id').range(from, from + PAGE - 1);
      if (error) {
        if (optional && notThere({ error, status })) return [];
        throw new Error(`${table}: ${error.message}`);
      }
      out.push(...((data ?? []) as T[]));
      if ((data?.length ?? 0) < PAGE) break;
    }
  }
  return out;
}

async function countIn(db: Db, table: string, col: string, values: string[]): Promise<number> {
  let n = 0;
  for (const part of chunks(values, IN_MAX)) {
    const { count, error, status } = await db.from(table).select('id', { count: 'exact' }).in(col, part).limit(1);
    if (error) {
      if (notThere({ error, status })) return 0;
      throw new Error(`${table}: ${error.message}`);
    }
    n += count ?? 0;
  }
  return n;
}

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  created_at: string;
  wa_id?: string | null;
  meta_lead_id?: string | null;
};
type Project = {
  id: string;
  enquiry_id: string;
  accepted_at?: string | null;
  accepted_signature?: string | null;
  deposit_paid_at?: string | null;
  /** A quote or contract on it ticked as signed on paper or with another e-sign service (crm-v3.sql). */
  signed_outside?: boolean;
  /** A purchase order on it has gone to a supplier (purchase-orders.sql): kit's been bought for it. */
  ordered?: boolean;
  /** A trade signed off on site (site-commissioning.sql): their sign-offs, the certificates and labour POs. */
  signed_off?: boolean;
};

async function customersIn(db: Db, ids: string[]): Promise<Customer[]> {
  try {
    return await rowsIn<Customer>(db, 'enquiries', 'id, name, email, phone, postcode, created_at, wa_id, meta_lead_id', 'id', ids);
  } catch (e) {
    // Before whatsapp.sql there's no wa_id or meta_lead_id.
    if (!/wa_id|meta_lead_id/.test(errorText(e))) throw e;
    return rowsIn<Customer>(db, 'enquiries', 'id, name, email, phone, postcode, created_at', 'id', ids);
  }
}

async function projectsOf(db: Db, enquiryIds: string[]): Promise<Project[]> {
  let projects: Project[];
  try {
    projects = await rowsIn<Project>(db, 'crm_projects', 'id, enquiry_id, accepted_at, accepted_signature, deposit_paid_at', 'enquiry_id', enquiryIds, true);
  } catch (e) {
    // Before crm-v2.sql nobody can sign or pay.
    if (!/accepted_|deposit_/.test(errorText(e))) throw e;
    projects = await rowsIn<Project>(db, 'crm_projects', 'id, enquiry_id', 'enquiry_id', enquiryIds, true);
  }
  // Before crm-v3.sql nothing can be ticked as signed.
  const docs = await rowsIn<{ project_id: string; signed_outside_at: string | null }>(
    db,
    'crm_documents',
    'project_id, signed_outside_at',
    'project_id',
    projects.map((p) => p.id),
    true
  ).catch((e: unknown) => {
    if (!/signed_outside/.test(errorText(e))) throw e;
    return [];
  });
  const ticked = new Set(docs.filter((d) => d.signed_outside_at).map((d) => d.project_id));
  // Purchase orders sent, confirmed or delivered (drafts don't count: they go with the job). None before
  // purchase-orders.sql; '*' because the kind column comes with site-commissioning.sql.
  const orders = await rowsIn<{ project_id: string; status: string; kind?: string | null }>(db, 'purchase_orders', '*', 'project_id', projects.map((p) => p.id), true);
  const ordered = new Set(orders.filter((o) => isOrdered(o.status) && o.kind !== 'labour').map((o) => o.project_id));
  // A trade signed off on site, or a labour PO of any status (held ones too). None before site-commissioning.sql.
  const site = await rowsIn<{ project_id: string; status: string; signed_at: string | null }>(db, 'site_assignments', 'project_id, status, signed_at', 'project_id', projects.map((p) => p.id), true);
  const signedOff = new Set([
    ...site.filter((a) => a.signed_at || a.status === 'signed' || a.status === 'done').map((a) => a.project_id),
    ...orders.filter((o) => o.kind === 'labour').map((o) => o.project_id),
  ]);
  return projects.map((p) => ({ ...p, signed_outside: ticked.has(p.id), ordered: ordered.has(p.id), signed_off: signedOff.has(p.id) }));
}

const signed = (p: Project) => !!(p.accepted_at || p.accepted_signature || p.signed_outside);
const paid = (p: Project) => !!p.deposit_paid_at;
const hasOrders = (p: Project) => !!p.ordered;
const signedOff = (p: Project) => !!p.signed_off;

/* ── The deleted list ────────────────────────────────────────────────────────── */

export type DeletedKind = 'meta_lead' | 'phone' | 'email';

/**
 * How an import could recognise someone, as one-way fingerprints: their Meta lead id, mobile
 * (WhatsApp form, so 07… and +44 … match) and email. Never the details themselves.
 */
export function fingerprints(p: { metaLeadId?: string | null; phone?: string | null; waId?: string | null; email?: string | null }) {
  const keys: [DeletedKind, string][] = [];
  const lead = p.metaLeadId?.trim();
  if (lead) keys.push(['meta_lead', lead]);
  for (const wa of new Set([toWaId(p.phone), toWaId(p.waId)])) if (wa) keys.push(['phone', wa]);
  const email = p.email?.trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) keys.push(['email', email]);
  return keys.map(([kind, value]) => ({ kind, hash: createHash('sha256').update(`heliaxis-deleted:${kind}:${value}`).digest('hex') }));
}

/** Is the deleted list there (deleted-customers.sql)? */
export async function deletedListReady(db: Db = createAdminClient()): Promise<boolean> {
  const { error } = await db.from(LIST).select('hash').limit(1);
  return !error;
}

/**
 * Was someone like this deleted on purpose? Says how they were recognised (their Meta lead id
 * first), false if not, or null when the deleted list isn't set up yet, so nobody can be skipped.
 * `at`: when what's being imported was sent. Their mobile or email only counts for things from
 * before they were deleted: anything newer is new contact. (No date: it counts.) Throws if the list
 * can't be read, so a hiccup fails the import rather than bringing back someone deleted.
 */
export async function deletedBefore(
  p: { metaLeadId?: string | null; phone?: string | null; email?: string | null },
  at?: string | null
): Promise<DeletedKind | false | null> {
  const keys = fingerprints(p);
  if (!keys.length) return false;
  const r = await createAdminClient().from(LIST).select('kind, deleted_at').in('hash', keys.map((k) => k.hash));
  if (notThere(r)) return null;
  if (r.error) throw new Error(`Couldn’t check the deleted list: ${r.error.message}`);
  const sent = at ? Date.parse(at) : NaN;
  const kinds = new Set(
    (r.data ?? []).filter((d) => d.kind === 'meta_lead' || !(sent > Date.parse(d.deleted_at))).map((d) => d.kind as DeletedKind)
  );
  return (['meta_lead', 'phone', 'email'] as const).find((k) => kinds.has(k)) ?? false;
}

/* ── What would go ───────────────────────────────────────────────────────────── */

export type DeleteCounts = {
  opportunities: number;
  tasks: number;
  photos: number;
  documents: number;
  signatures: number;
  messages: number;
  emails: number;
};

export type DeletePreview = {
  customers: { id: string; name: string; signed: boolean; paid: boolean; ordered: boolean; signed_off: boolean }[];
  /** Ids that aren't in the CRM (already deleted). */
  gone: number;
  /** What goes with everyone, and with everyone but those with a signed quote, paid deposit, purchase order or trade sign-off. */
  counts: { all: DeleteCounts; withoutSigned: DeleteCounts };
  /** Someone not being deleted has the same WhatsApp number (a duplicate): they stay. */
  sameNumber: { name: string; other: string }[];
  /** False until deleted-customers.sql has been run: imports can't skip deleted people yet. */
  importsSkip: boolean;
};

async function countsFor(db: Db, enquiryIds: string[], projects: Project[]): Promise<DeleteCounts> {
  const projectIds = projects.map((p) => p.id);
  const [tasks, photos, documents, messages, emails] = await Promise.all([
    countIn(db, 'tasks', 'crm_project_id', projectIds),
    countIn(db, 'crm_photos', 'project_id', projectIds),
    countIn(db, 'crm_documents', 'project_id', projectIds),
    countIn(db, 'whatsapp_messages', 'enquiry_id', enquiryIds),
    countIn(db, 'crm_emails', 'enquiry_id', enquiryIds),
  ]);
  return { opportunities: projects.length, tasks, photos, documents, signatures: projects.filter((p) => p.accepted_signature).length, messages, emails };
}

/**
 * Everyone whose record shows the chat on one of these WhatsApp numbers: by their WhatsApp id, or,
 * before they have one, their phone as typed (07…, +44 …), as the record page links them.
 */
async function onNumbers(db: Db, numbers: string[]) {
  const out: { id: string; name: string; number: string }[] = [];
  for (const part of chunks(numbers.filter((n) => /^\d+$/.test(n)), 20)) {
    // Phones are stored as typed, so narrow by the last 9 digits, then compare properly.
    const ors = part.flatMap((wa) => {
      const tail = wa.slice(-9);
      return [`wa_id.eq.${wa}`, `phone.ilike.%${tail.slice(0, 3)}%${tail.slice(3, 6)}%${tail.slice(6)}%`];
    });
    const { data, error } = await db.from('enquiries').select('id, name, phone, wa_id').or(ors.join(',')).limit(PAGE);
    if (error) throw new Error(`enquiries: ${error.message}`);
    for (const r of (data ?? []) as { id: string; name: string; phone: string | null; wa_id: string | null }[]) {
      const number = r.wa_id || toWaId(r.phone);
      if (number && part.includes(number)) out.push({ id: r.id, name: r.name, number });
    }
  }
  return out;
}

/** What deleting these customers would remove, for the confirmation. Changes nothing. */
export async function previewDelete(ids: string[]): Promise<DeletePreview> {
  const db = createAdminClient();
  const unique = [...new Set(ids.filter(isCustomerId).map((s) => s.toLowerCase()))];
  const found = await customersIn(db, unique);
  const idSet = new Set(found.map((c) => c.id));
  const projects = await projectsOf(db, [...idSet]);
  const customers = found.map((c) => {
    const mine = projects.filter((p) => p.enquiry_id === c.id);
    return { id: c.id, name: c.name, signed: mine.some(signed), paid: mine.some(paid), ordered: mine.some(hasOrders), signed_off: mine.some(signedOff) };
  });
  const held = new Set(customers.filter((c) => c.signed || c.paid || c.ordered || c.signed_off).map((c) => c.id));

  const numbers = [...new Set(found.map((c) => c.wa_id).filter((w): w is string => !!w))];
  const [all, sharing, importsSkip] = await Promise.all([
    countsFor(db, [...idSet], projects),
    onNumbers(db, numbers),
    deletedListReady(db),
  ]);
  const withoutSigned = held.size
    ? await countsFor(db, [...idSet].filter((id) => !held.has(id)), projects.filter((p) => !held.has(p.enquiry_id)))
    : all;

  const nameOf = new Map(found.map((c) => [c.wa_id, c.name]));
  return {
    customers,
    gone: unique.length - found.length,
    counts: { all, withoutSigned },
    sameNumber: sharing.filter((o) => !idSet.has(o.id)).map((o) => ({ name: nameOf.get(o.number) ?? '', other: o.name })),
    importsSkip,
  };
}

/* ── Deleting ────────────────────────────────────────────────────────────────── */

export type DeleteOutcome = {
  /** Customers deleted. */
  deleted: number;
  /** Already gone: deleted before (or meanwhile), or never in the CRM. */
  gone: number;
  /** Customers left as they were, and why. `held`: a signed quote, paid deposit or purchase order sent, not ticked to include. */
  errors: { id: string; name: string | null; error: string; held?: boolean }[];
  /** Files taken out of storage, and ones that wouldn't go (logged). */
  files: { removed: number; failed: number };
  /** False when they couldn't go on the deleted list (deleted-customers.sql not run): imports can't skip them. */
  remembered: boolean;
};

/**
 * Delete these customers and everything about them (see the top of this file). Signed quotes, paid
 * deposits and purchase orders that have gone to a supplier are kept unless `includeSigned`: the
 * business may need those records (draft orders just go with them). Up to 50 at a time inside; one
 * that fails doesn't stop the rest.
 */
export async function deleteCustomers(ids: string[], opts: { includeSigned?: boolean } = {}): Promise<DeleteOutcome> {
  const db = createAdminClient();
  const out: DeleteOutcome = { deleted: 0, gone: 0, errors: [], files: { removed: 0, failed: 0 }, remembered: true };
  const unique = [...new Set(ids.filter(isCustomerId).map((s) => s.toLowerCase()))];
  for (const part of chunks(unique, 50)) await deleteSome(db, part, !!opts.includeSigned, out);
  return out;
}

export type Files = { bucket: string; path: string }[];

async function deleteSome(db: Db, ids: string[], includeSigned: boolean, out: DeleteOutcome) {
  const fail = (list: { id: string; name: string | null }[], e: unknown) =>
    list.forEach((c) => out.errors.push({ id: c.id, name: c.name, error: errorText(e) }));

  // 1. Who they are and what they have. Nothing has changed yet, so any failure here leaves them as they were.
  let found: Customer[];
  let projects: Project[];
  try {
    found = await customersIn(db, ids);
    projects = await projectsOf(db, found.map((c) => c.id));
  } catch (e) {
    return fail(ids.map((id) => ({ id, name: null })), e);
  }
  out.gone += ids.length - found.length;

  const held = new Set(includeSigned ? [] : projects.filter((p) => signed(p) || paid(p) || hasOrders(p) || signedOff(p)).map((p) => p.enquiry_id));
  for (const c of found) {
    if (!held.has(c.id)) continue;
    const mine = projects.filter((p) => p.enquiry_id === c.id);
    const reasons = [mine.some(signed) && 'a signed quote', mine.some(paid) && 'a paid deposit', mine.some(hasOrders) && 'a purchase order sent to a supplier', mine.some(signedOff) && 'trade sign-offs and certificates'].filter(
      (x): x is string => !!x
    );
    const what = reasons.length > 1 ? `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1)}` : reasons[0];
    out.errors.push({ id: c.id, name: c.name, held: true, error: `Kept: ${c.name} has ${what}. Tick to include them.` });
  }
  const going = found.filter((c) => !held.has(c.id));
  if (!going.length) return;
  const goingIds = new Set(going.map((c) => c.id));
  const theirs = projects.filter((p) => goingIds.has(p.enquiry_id));
  const projectIds = theirs.map((p) => p.id);

  // Their files, read before the rows that list them go.
  let files: Files;
  let taskIds: string[];
  let surveyIds: string[];
  try {
    const [photos, docs, tasks, surveys] = await Promise.all([
      rowsIn<{ project_id: string; storage_path: string }>(db, 'crm_photos', 'project_id, storage_path', 'project_id', projectIds, true),
      rowsIn<{ project_id: string; storage_path: string }>(db, 'crm_documents', 'project_id, storage_path', 'project_id', projectIds, true),
      rowsIn<{ id: string }>(db, 'tasks', 'id', 'crm_project_id', projectIds, true),
      rowsIn<{ id: string }>(db, 'crm_surveys', 'id', 'project_id', projectIds, true),
    ]);
    files = [
      ...photos.flatMap((p) => [p.storage_path, thumbPath(p.storage_path)].map((path) => ({ bucket: CRM_BUCKET, path }))),
      ...docs.map((d) => ({ bucket: DOCS_BUCKET, path: d.storage_path })),
      ...theirs.flatMap((p) => (p.accepted_signature ? [{ bucket: DOCS_BUCKET, path: p.accepted_signature }] : [])),
    ];
    taskIds = tasks.map((t) => t.id);
    surveyIds = surveys.map((s) => s.id);
  } catch (e) {
    return fail(going, e);
  }

  // Other numbers, emails and Meta lead ids a merge kept on them (crm_aliases goes with them below):
  // on the deleted list too, or a merged-away Meta lead would come back with the next import.
  const kept = await aliasContacts(db, [...goingIds]);

  // 2. Notifications that link to them, their opportunities, those tasks or their surveys, and the new
  //    enquiry and email alerts that name them. Links are text, so nothing cascades to these; a
  //    failure here stops before the customer goes, so it can be re-run.
  try {
    await deleteNotifications(db, [...goingIds, ...projectIds, ...taskIds, ...surveyIds]);
    await deleteRefNotifications(db, [...goingIds]);
    await deleteListNotifications(db, going, goingIds);
  } catch (e) {
    return fail(going, e);
  }

  // 3. The customers. Everything that references them goes in the same statement.
  const deleted = new Set<string>();
  const { data, error } = await db.from('enquiries').delete().in('id', [...goingIds]).select('id');
  if (!error) {
    for (const r of data ?? []) deleted.add(r.id as string);
  } else {
    // All or nothing: one at a time, so one that can't go doesn't hold up the rest.
    for (const c of going) {
      const r = await db.from('enquiries').delete().eq('id', c.id).select('id');
      if (r.error) out.errors.push({ id: c.id, name: c.name, error: r.error.message });
      else if (r.data?.length) deleted.add(c.id);
    }
  }
  out.deleted += deleted.size;
  out.gone += going.filter((c) => !deleted.has(c.id) && !out.errors.some((x) => x.id === c.id)).length;
  if (!deleted.size) return;

  // 4. On the deleted list, so imports skip them.
  const prints = new Map(
    going
      .filter((c) => deleted.has(c.id))
      .flatMap((c) => {
        const more = kept.get(c.id);
        return [
          ...fingerprints({ metaLeadId: c.meta_lead_id, phone: c.phone, waId: c.wa_id, email: c.email }),
          ...(more ? [...more.phones.map((phone) => ({ phone })), ...more.emails.map((email) => ({ email })), ...more.metaLeads.map((metaLeadId) => ({ metaLeadId }))].flatMap(fingerprints) : []),
        ];
      })
      .map((f) => [f.hash, f])
  );
  if (prints.size) {
    const now = new Date().toISOString();
    const saved = await db.from(LIST).upsert([...prints.values()].map((f) => ({ ...f, deleted_at: now })), { onConflict: 'hash' });
    if (saved.error) {
      out.remembered = false;
      if (!notThere(saved)) console.error('[delete-customer] deleted list not updated:', saved.error.message || saved.status);
    }
  }

  const gonePids = new Set(theirs.filter((p) => deleted.has(p.enquiry_id)).map((p) => p.id));
  const added = going.filter((c) => deleted.has(c.id)).map((c) => Date.parse(c.created_at)).filter(Number.isFinite);
  await forgetInMetis(db, [...deleted, ...gonePids], new Date(Math.min(Date.now(), ...added)).toISOString());
  // The photos, voice notes and files they sent on WhatsApp (a folder per customer, whatsapp/media.ts).
  await removeFiles(db, await mediaFilesOf([...deleted]), out);

  // 5. Their files, plus anything uploaded without being saved (an upload cut off part way).
  if (!gonePids.size) return;
  const mine = (f: { bucket: string; path: string }) => {
    // Only ever inside their own opportunities' folders, never anything shared (the library).
    const [a, b] = f.path.split('/');
    return f.bucket === CRM_BUCKET ? gonePids.has(a) : (a === 'projects' || a === 'signatures') && gonePids.has(b);
  };
  const extra = await leftoverFiles(db, gonePids);
  await removeFiles(db, [...files, ...extra].filter(mine), out);
}

/**
 * Metis keeps what her lookups returned in each conversation (assistant_threads), so a lookup that
 * names them (by customer or opportunity id) is replaced, and she can't quote their details back.
 * Only conversations since the earliest of them was added can mention them. Not fatal: logged.
 */
export async function forgetInMetis(db: Db, ids: string[], since: string) {
  type Block = { type?: string; content?: unknown };
  type Message = { role: string; content: string | Block[] };
  const mentions = (b: Block) => b.type === 'tool_result' && ids.some((id) => JSON.stringify(b.content ?? '').includes(id));
  for (let from = 0; ; from += 50) {
    const { data, error, status } = await db.from('assistant_threads').select('id, messages').gte('updated_at', since).order('id').range(from, from + 49);
    if (error) {
      if (!notThere({ error, status })) console.error('[delete-customer] Metis conversations not cleared:', error.message);
      return;
    }
    for (const t of data ?? []) {
      const messages = t.messages as Message[];
      if (!messages.some((m) => Array.isArray(m.content) && m.content.some(mentions))) continue;
      const cleared = messages.map((m) =>
        Array.isArray(m.content) ? { ...m, content: m.content.map((b) => (mentions(b) ? { ...b, content: '[Customer deleted]' } : b)) } : m
      );
      const r = await db.from('assistant_threads').update({ messages: cleared }).eq('id', t.id);
      if (r.error) console.error('[delete-customer] Metis conversation not cleared:', r.error.message);
    }
    if ((data?.length ?? 0) < 50) return;
  }
}

/** Delete notifications whose link mentions any of these ids (all uuids, so no false matches). */
export async function deleteNotifications(db: Db, ids: string[]) {
  for (const part of chunks(ids, 40)) {
    const r = await db
      .from('notifications')
      .delete()
      .or(part.map((id) => `href.like.*${id}*`).join(','));
    if (r.error && !notThere(r)) throw new Error(`notifications: ${r.error.message || r.status}`);
    if (r.error) return;
  }
}

/** Chat, reply and lead alerts tagged with the customer (notifications-ref.sql). Fine before that's run. */
async function deleteRefNotifications(db: Db, enquiryIds: string[]) {
  for (const part of chunks(enquiryIds, 40)) {
    const refs = part.flatMap((id) => [chatRef(id), replyRef(id), leadRef(id)]);
    const r = await db.from('notifications').delete().in('ref', refs);
    if (!r.error) continue;
    if (notThere(r) || r.error.code === '42703' || /column .*ref.* does not exist/i.test(r.error.message ?? '')) return;
    throw new Error(`notifications: ${r.error.message || r.status}`);
  }
}

/**
 * New enquiry, Meta lead and email alerts link to a list, not to them (older ones, at least), so
 * they're found by their exact title. Not a title someone being kept would have too (the same
 * name): it could be theirs. A " or \ can't be matched safely in a filter, so those are left.
 */
async function deleteListNotifications(db: Db, going: Customer[], goingIds: Set<string>) {
  const safe = (s: string) => !!s && !/["\\]/.test(s);
  const titlesOf = (c: { name: string; postcode: string | null }) =>
    [`New enquiry: ${c.name}`, c.postcode ? `New enquiry: ${c.name} (${c.postcode})` : '', `New Meta lead: ${c.name}`, `Email from ${c.name}`].filter(safe);
  const names = [...new Set(going.map((c) => c.name).filter(safe))];
  const sameName = await rowsIn<{ id: string; name: string; postcode: string | null }>(db, 'enquiries', 'id, name, postcode', 'name', names);
  const keptTitles = new Set(sameName.filter((o) => !goingIds.has(o.id)).flatMap(titlesOf));
  const titles = new Set(going.filter((c) => safe(c.name)).flatMap(titlesOf).filter((t) => !keptTitles.has(t)));
  for (const part of chunks([...titles], 40)) {
    const r = await db.from('notifications').delete().in('href', ['/admin/enquiries', '/admin/crm']).in('title', part);
    if (r.error && !notThere(r)) throw new Error(`notifications: ${r.error.message || r.status}`);
    if (r.error) return;
  }
}

/** Names directly inside a storage folder: [name, isFolder]. Empty if the bucket isn't there yet. */
async function folder(db: Db, bucket: string, prefix: string): Promise<[string, boolean][]> {
  const out: [string, boolean][] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error || !data) return out;
    out.push(...data.map((o): [string, boolean] => [o.name, !o.id]));
    if (data.length < PAGE) return out;
  }
}

/**
 * Files in their opportunities' folders that no row lists. Each bucket's top folders are read once
 * (not once per opportunity), then only the folders of opportunities being deleted.
 */
export async function leftoverFiles(db: Db, projectIds: Set<string>): Promise<Files> {
  const out: Files = [];
  const walk = async (bucket: string, prefix: string, depth: number) => {
    for (const [name, isFolder] of await folder(db, bucket, prefix)) {
      if (!isFolder) out.push({ bucket, path: `${prefix}/${name}` });
      else if (depth > 0) await walk(bucket, `${prefix}/${name}`, depth - 1);
    }
  };
  const roots: [string, string, number][] = [
    [CRM_BUCKET, '', 1], // <project>/<category>/<file>
    [DOCS_BUCKET, 'projects', 0], // projects/<project>/<file>
    [DOCS_BUCKET, 'signatures', 0], // signatures/<project>/<file>
  ];
  try {
    for (const [bucket, root, depth] of roots) {
      const here = (await folder(db, bucket, root)).filter(([name, isFolder]) => isFolder && projectIds.has(name));
      // A few folders at a time: a big batch of customers with photos is a lot of small requests.
      for (const part of chunks(here, 8)) await Promise.all(part.map(([name]) => walk(bucket, root ? `${root}/${name}` : name, depth)));
    }
  } catch (e) {
    console.error('[delete-customer] could not look for leftover files:', errorText(e));
  }
  return out;
}

export async function removeFiles(db: Db, files: Files, out: DeleteOutcome) {
  const byBucket = new Map<string, Set<string>>();
  for (const f of files) byBucket.set(f.bucket, (byBucket.get(f.bucket) ?? new Set()).add(f.path));
  for (const [bucket, paths] of byBucket) {
    for (const part of chunks([...paths], 100)) {
      // A missing file (a photo without its thumbnail, say) isn't an error, just not in the list back.
      const { data, error } = await db.storage
        .from(bucket)
        .remove(part)
        .catch((e: unknown) => ({ data: null, error: { message: errorText(e) } }));
      if (error) {
        out.files.failed += part.length;
        console.error(`[delete-customer] ${plural(part.length, 'file')} not removed from ${bucket} (${error.message}):`, part.join(' '));
      } else out.files.removed += data?.length ?? 0;
    }
  }
}
