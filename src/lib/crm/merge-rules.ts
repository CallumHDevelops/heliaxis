import { isProjectStage, SALES_STAGES, stageIndex, stageLabel } from './stages';
import { postcodeKey, ukPostcode } from './site-postcode';
import { toWaId } from '../whatsapp/shared';
import { leadSourceLabel } from '../lead-source';
import { isMetaSource } from '../ad-spend';

/**
 * Merging duplicates (src/lib/crm/merge.ts does the reading and writing): which customer stays, which of
 * each detail is kept, which jobs join, what a joined job ends up with, the WhatsApp number and
 * permission, the old values that keep finding the record (aliases), the leads Reports keep counting
 * (lead origins), the warnings, and the plan the database's crm_merge() carries out (supabase/merge.sql).
 * Pure, so scripts/test-merge.mjs runs it in node and the merge sheet can use it in the browser.
 *
 * MERGE_TABLES is the one place for people: every table.column that points at a customer or a job, its
 * name in the summary, what happens when it would clash, and its files in storage. The database moves
 * whatever points at a record whether or not it's listed here (it reads its own list of foreign keys);
 * the test fails until every one in supabase/*.sql has its line.
 */

/* ── The tables ─────────────────────────────────────────────────────────────────────── */

/**
 * When a unique rule would see the merged-away row clash with the kept one's: 'drop-ours' (the same thing
 * is already there, made by the same rule), { cancel: {col: value} } (set those on ours first), or
 * 'block' (refuse, naming the table). No policy is 'block': nothing is ever lost quietly.
 */
export type ClashPolicy = 'drop-ours' | 'block' | { cancel: Record<string, unknown> };

export type MergeTable = {
  /** What the column points at. */
  to: 'customer' | 'job';
  /** In the summary: [one, many]. Left out of it without. */
  label?: [string, string];
  clash?: ClashPolicy;
  /** Files in storage named by the record's id, moved to the kept record's folder afterwards. */
  files?: { bucket: string; folder: (id: string) => string; columns: string[] };
  /** The merge's own bookkeeping (moved, never counted). */
  internal?: true;
};

export const MERGE_TABLES: Record<string, MergeTable> = {
  'crm_projects.enquiry_id': { to: 'customer' },
  'whatsapp_messages.enquiry_id': {
    to: 'customer',
    label: ['WhatsApp message', 'WhatsApp messages'],
    files: { bucket: 'whatsapp-media', folder: (id) => `${id}/`, columns: ['media_path'] },
  },
  // Pending automatic ones are cancelled first (supabase/merge.sql); staff's Send later ones move and stay.
  'whatsapp_outbox.enquiry_id': { to: 'customer' },
  'crm_activities.enquiry_id': { to: 'customer', label: ['timeline note', 'timeline notes'] },
  'crm_activities.project_id': { to: 'job', label: ['timeline note', 'timeline notes'] },
  'crm_emails.enquiry_id': { to: 'customer', label: ['email', 'emails'] },
  'crm_emails.project_id': { to: 'job', label: ['email', 'emails'] },
  'tasks.crm_project_id': { to: 'job', label: ['task', 'tasks'], clash: 'drop-ours' },
  'crm_photos.project_id': {
    to: 'job',
    label: ['photo', 'photos'],
    files: { bucket: 'crm-photos', folder: (id) => `${id}/`, columns: ['storage_path', 'markup_path'] },
  },
  'crm_documents.project_id': {
    to: 'job',
    label: ['document', 'documents'],
    files: { bucket: 'crm-docs', folder: (id) => `projects/${id}/`, columns: ['storage_path'] },
  },
  // One open survey of each kind per job, and one live booking: sorted out first (supabase/merge.sql).
  'crm_surveys.enquiry_id': { to: 'customer', label: ['survey', 'surveys'] },
  'crm_surveys.project_id': {
    to: 'job',
    label: ['survey', 'surveys'],
    files: { bucket: 'crm-docs', folder: (id) => `signatures/${id}/`, columns: ['customer_signature'] },
  },
  'survey_bookings.enquiry_id': { to: 'customer', label: ['survey booking', 'survey bookings'] },
  'survey_bookings.project_id': { to: 'job', label: ['survey booking', 'survey bookings'] },
  'survey_bookings.duplicate_of': { to: 'customer' },
  'diary_entries.project_id': { to: 'job', label: ['diary entry', 'diary entries'] },
  'purchase_orders.project_id': { to: 'job', label: ['purchase order', 'purchase orders'] },
  // The site app: a trade on the job moves with everything of theirs (sign-offs, photos, POs). Their
  // signatures are in the job's signatures folder, named in rows of their own (site/merge-paths.ts).
  'site_assignments.project_id': { to: 'job', label: ['trade on the site app', 'trades on the site app'] },
  // The handover pack: one row per item and one pack per job. Only a project has them, and two projects
  // can't be joined, so a clash means something unexpected: refused, never one of them dropped.
  'handover_slots.project_id': { to: 'job', label: ['handover pack item', 'handover pack items'], clash: 'block' },
  'handover_packs.project_id': { to: 'job', label: ['handover pack', 'handover packs'], clash: 'block' },
  'crm_payments.project_id': { to: 'job', label: ['payment', 'payments'] },
  'assistant_drafts.enquiry_id': { to: 'customer', label: ['draft from Metis', 'drafts from Metis'] },
  'assistant_drafts.project_id': { to: 'job', label: ['draft from Metis', 'drafts from Metis'] },
  'crm_aliases.enquiry_id': { to: 'customer', internal: true },
  'crm_aliases.project_id': { to: 'job', internal: true },
  'crm_lead_origins.enquiry_id': { to: 'customer', internal: true },
  'crm_lead_origins.project_id': { to: 'job', internal: true },
  'crm_merges.kept_enquiry_id': { to: 'customer', internal: true },
  'crm_distinct_pairs.a': { to: 'customer', internal: true },
  'crm_distinct_pairs.b': { to: 'customer', internal: true },
};

const tableOf = (key: string) => key.slice(0, key.indexOf('.'));

/** Each table's name in the summary, in this order: [{table, one, many}]. */
export function summaryLabels(): { table: string; one: string; many: string }[] {
  const out = new Map<string, { table: string; one: string; many: string }>();
  for (const [key, t] of Object.entries(MERGE_TABLES)) {
    const table = tableOf(key);
    if (t.label && !out.has(table)) out.set(table, { table, one: t.label[0], many: t.label[1] });
  }
  return [...out.values()];
}

/** Clash policies by table, for crm_merge(). */
export function clashPolicies(): Record<string, ClashPolicy> {
  const out: Record<string, ClashPolicy> = {};
  for (const [key, t] of Object.entries(MERGE_TABLES)) if (t.clash) out[tableOf(key)] = t.clash;
  return out;
}

/** "14 WhatsApp messages, 2 timeline notes, 1 task" from crm_merge()'s summary ({table: n}). Tables with no name are left out. */
export function summaryWords(summary: Record<string, number> | null | undefined): string {
  return summaryLabels()
    .map((l) => [Number(summary?.[l.table]) || 0, l] as const)
    .filter(([n]) => n > 0)
    .map(([n, l]) => `${n} ${n === 1 ? l.one : l.many}`)
    .join(', ');
}

/** What a merge closes or drops ({table: n} from crm_merge()), in words: "1 automatic WhatsApp waiting to go". */
export function cancelledWords(cancelled: Record<string, number> | null | undefined): string {
  const words: Record<string, [string, string]> = {
    whatsapp_outbox: ['automatic WhatsApp waiting to go', 'automatic WhatsApps waiting to go'],
    survey_bookings: ['survey booking', 'survey bookings'],
    crm_surveys: ['empty survey', 'empty surveys'],
    tasks: ['automatic task already on the job', 'automatic tasks already on the job'],
    crm_documents: ['quote no longer waiting to be signed', 'quotes no longer waiting to be signed'],
  };
  return Object.entries(cancelled ?? {})
    .filter(([, n]) => Number(n) > 0)
    .map(([t, n]) => `${n} ${(words[t] ?? [t, t])[Number(n) === 1 ? 0 : 1]}`)
    .join(', ');
}

/** Storage folders to move: each job joined into another, and the merged-away customer's WhatsApp files. */
export function folderMoves(p: { merge: string | null; keep: string; joins: { from: string; into: string }[] }): { bucket: string; from: string; to: string }[] {
  const out: { bucket: string; from: string; to: string }[] = [];
  for (const t of Object.values(MERGE_TABLES)) {
    if (!t.files) continue;
    const add = (from: string, to: string) => {
      const m = { bucket: t.files!.bucket, from: t.files!.folder(from), to: t.files!.folder(to) };
      if (!out.some((o) => o.bucket === m.bucket && o.from === m.from)) out.push(m);
    };
    if (t.to === 'job') for (const j of p.joins) add(j.from, j.into);
    else if (p.merge) add(p.merge, p.keep);
  }
  return out;
}

/* ── The records ────────────────────────────────────────────────────────────────────── */

export type Row = Record<string, unknown>;

/** enquiries, read with select('*'): newer columns may not be there yet. */
export type Customer = Row & {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  source: string | null;
  created_at: string;
  interest?: string | null;
  property_type?: string | null;
  customer_ref?: string | null;
  wa_id?: string | null;
  wa_last_inbound_at?: string | null;
  whatsapp_opt_in?: boolean | null;
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_in_source?: string | null;
  meta_lead_id?: string | null;
  meta_ad_id?: string | null;
  meta_adset_id?: string | null;
  meta_campaign_id?: string | null;
  meta_fbc?: string | null;
};

/** crm_projects, read with select('*'). */
export type Job = Row & {
  id: string;
  enquiry_id: string;
  title: string | null;
  stage: string;
  products: string[] | null;
  created_at: string;
  updated_at?: string | null;
  project_ref?: string | null;
  owner_id?: string | null;
  postcode?: string | null;
  address?: string | null;
  first_contact_at?: string | null;
  next_step?: string | null;
  next_step_at?: string | null;
  notes?: string | null;
  rams_project_id?: string | null;
  sequence_stopped_at?: string | null;
};

/** A lead as Reports count it (crm_lead_origins without its ids). */
export type Origin = {
  enquiry_id: string;
  source: string;
  came_in_at: string | null;
  job_created_at: string;
  first_contact_at: string | null;
  owner_id: string | null;
  meta_lead_id: string | null;
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  customer_ref: string | null;
  project_ref: string | null;
};

export type JobFacts = {
  job: Job;
  /** Signed in the portal, or a quote or contract ticked as signed outside it. */
  signed: boolean;
  paid: boolean;
  /** Purchase orders that have gone to a supplier. */
  ordersSent: number;
  /** Open (booked or started) surveys, and whether each has answers yet. */
  surveys: { id: string; type: string; answered: boolean }[];
  /** Its live survey booking (requested or confirmed). */
  booking: { id: string; status: string; start: string | null } | null;
  /** A quote waiting to be signed in the portal. */
  waitingQuote: boolean;
  /** Its own lead, when it came from another customer in an earlier merge (role 'own'). */
  own: Origin | null;
};

export type Side = {
  customer: Customer;
  jobs: JobFacts[];
  /** WhatsApp messages on this record. */
  messages: number;
  /** Of those, the ones they sent us: proof the number is on WhatsApp (ours to it may have failed). */
  inbound: number;
  /** Automatic WhatsApps waiting to go, and messages staff scheduled (Send later). */
  outbox: { automatic: number; scheduled: { at: string; by: string | null }[] };
};

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const blank = (v: unknown) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
const emptyObj = (v: unknown) => !v || typeof v !== 'object' || !Object.keys(v as object).length;
const refOf = (c: Customer) => c.customer_ref || c.name;
const jobRef = (j: Job) => j.project_ref || j.title || 'the other job';
const ukDate = (iso: string | null | undefined) =>
  iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : '';
const ukDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ── Which customer stays ───────────────────────────────────────────────────────────── */

/** A contract on it: a signed quote, a paid deposit, or kit ordered. */
export const hasContract = (f: Pick<JobFacts, 'signed' | 'paid' | 'ordersSent'>) => f.signed || f.paid || f.ordersSent > 0;
export const isOpen = (stage: string) => stage !== 'complete' && stage !== 'lost';

/** How far on a job is: contracts first, then the stage (Lost lowest, though it's last in the list). */
export function jobRank(f: Pick<JobFacts, 'signed' | 'paid' | 'ordersSent'> & { job: Pick<Job, 'stage'> }): number {
  return (hasContract(f) ? 100 : 0) + (f.job.stage === 'lost' ? -1 : stageIndex(f.job.stage));
}

const bestJob = (s: Side) => [...s.jobs].sort((a, b) => jobRank(b) - jobRank(a) || a.job.created_at.localeCompare(b.job.created_at))[0] ?? null;
const sideRank = (s: Side) => (bestJob(s) ? jobRank(bestJob(s)!) : -2);

/** The one to keep by default, and why: the one whose best job is further on; a tie, the one that came in first. */
export function suggestKeep(a: Side, b: Side): { keep: 'a' | 'b'; why: string } {
  const ra = sideRank(a);
  const rb = sideRank(b);
  if (ra !== rb) {
    const w = ra > rb ? a : b;
    const best = bestJob(w)!;
    const why = best.signed
      ? 'it has the signed quote'
      : best.paid
        ? 'it has the paid deposit'
        : best.ordersSent
          ? 'kit has been ordered for its job'
          : `its job is further on: ${stageLabel(best.job.stage)}`;
    return { keep: ra > rb ? 'a' : 'b', why };
  }
  const older = a.customer.created_at <= b.customer.created_at ? 'a' : 'b';
  return { keep: older, why: `it came in first, on ${ukDate((older === 'a' ? a : b).customer.created_at)}` };
}

/* ── Their details ──────────────────────────────────────────────────────────────────── */

export type FieldKey = 'name' | 'phone' | 'email' | 'postcode' | 'interest' | 'property_type';
export const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Name',
  phone: 'Mobile',
  email: 'Email',
  postcode: 'Postcode',
  interest: 'Interested in',
  property_type: 'Property',
};
export type FieldRow = { key: FieldKey; label: string; kept: string; other: string; same: boolean; pick: 'keep' | 'merge'; why: string };

/** A name that isn't really one: empty, "Meta lead", "Unknown", or just a phone number. */
export const placeholderName = (name: unknown) => {
  const n = text(name);
  return !n || /^(meta lead|unknown|lead|whatsapp lead|no name)$/i.test(n) || /^\+?[\d\s()-]{7,}$/.test(n);
};
/** A UK mobile (07…, +44 7…). */
export const isMobile = (phone: unknown) => !!toWaId(text(phone))?.startsWith('447');
/** A UK landline (01…, 02…, 03…). */
export const isLandline = (phone: unknown) => /^44[123]/.test(toWaId(text(phone)) ?? '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const goodEmail = (v: unknown) => EMAIL.test(text(v));

const sameValue = (k: FieldKey, a: unknown, b: unknown) => {
  if (k === 'phone') return (toWaId(text(a)) ?? text(a)) === (toWaId(text(b)) ?? text(b));
  if (k === 'postcode') return postcodeKey(text(a)) === postcodeKey(text(b));
  return text(a).replace(/\s+/g, ' ').toLowerCase() === text(b).replace(/\s+/g, ' ').toLowerCase();
};

/** One row per detail with a value on either side: both values, the one ticked by default and why. */
export function fieldRows(kept: Customer, other: Customer): FieldRow[] {
  const k = refOf(kept);
  const o = refOf(other);
  const rows: FieldRow[] = [];
  for (const key of Object.keys(FIELD_LABELS) as FieldKey[]) {
    if (!(key in kept) && !(key in other)) continue;
    const a = text(kept[key]);
    const b = text(other[key]);
    if (!a && !b) continue;
    const row = (pick: 'keep' | 'merge', why: string): FieldRow => ({ key, label: FIELD_LABELS[key], kept: a, other: b, same: false, pick, why });
    if (sameValue(key, a, b)) {
      rows.push({ ...row('keep', 'Same on both'), same: true });
      continue;
    }
    if (!b) {
      rows.push(row('keep', `Only ${k} has one`));
      continue;
    }
    if (!a) {
      rows.push(row('merge', `Only ${o} has one`));
      continue;
    }
    if (key === 'name' && placeholderName(a) && !placeholderName(b)) rows.push(row('merge', `${k}’s isn’t a real name`));
    else if (key === 'phone' && isLandline(a) && isMobile(b)) rows.push(row('merge', 'WhatsApp needs a mobile'));
    else if (key === 'phone' && isMobile(a) && isLandline(b)) rows.push(row('keep', 'WhatsApp needs a mobile'));
    else if (key === 'phone' && !toWaId(a) && toWaId(b)) rows.push(row('merge', `${k}’s isn’t a phone number`));
    else if (key === 'email' && !goodEmail(a) && goodEmail(b)) rows.push(row('merge', `${k}’s isn’t an email address`));
    else if (key === 'postcode' && !ukPostcode(a) && ukPostcode(b)) rows.push(row('merge', `${k}’s isn’t a UK postcode`));
    else rows.push(row('keep', `From the record that stays (${k})`));
  }
  return rows;
}

/* ── WhatsApp ───────────────────────────────────────────────────────────────────────── */

/**
 * Who replies go to: the number the conversation is on. One record they've messaged from: its number;
 * both: the one they last messaged from (its 24-hour window may be open); neither: the main phone if it's
 * a mobile, else any mobile they have. `from`: whose number (and 24-hour window) it is.
 */
export function chooseWhatsApp(kept: Side, other: Side, mainPhone: string | null): { waId: string | null; from: 'keep' | 'merge' | null } {
  const numberOf = (s: Side) => s.customer.wa_id || toWaId(s.customer.phone) || null;
  const pick = (from: 'keep' | 'merge') => ({ waId: numberOf(from === 'keep' ? kept : other), from });
  // Only their own messages count: our intro to a landline is saved as sent before Meta says it failed.
  const chat = (s: Side) => !!(s.inbound || text(s.customer.wa_last_inbound_at)) && !!numberOf(s);
  if (chat(kept) && !chat(other)) return pick('keep');
  if (chat(other) && !chat(kept)) return pick('merge');
  if (chat(kept) && chat(other)) {
    const a = text(kept.customer.wa_last_inbound_at);
    const b = text(other.customer.wa_last_inbound_at);
    return pick(b > a ? 'merge' : 'keep');
  }
  const main = toWaId(mainPhone);
  const candidates = [main, kept.customer.wa_id, other.customer.wa_id, toWaId(kept.customer.phone), toWaId(other.customer.phone)];
  const mobile = candidates.find((n) => n?.startsWith('447')) ?? null;
  const waId = mobile ?? kept.customer.wa_id ?? main ?? null;
  return { waId, from: waId && waId === numberOf(other) && waId !== numberOf(kept) ? 'merge' : waId ? 'keep' : null };
}

/** As src/lib/whatsapp/permission.ts records it (that file is server-only). */
export const STOP_SOURCE = 'stop-reply';
const STAFF_STOP = 'staff-stop:';
const NOT_ASKED = 'not-asked:';
type Perm = Pick<Customer, 'whatsapp_opt_in' | 'whatsapp_opt_in_at' | 'whatsapp_opt_in_source'>;
const repliedStop = (r: Perm) => r.whatsapp_opt_in === false && r.whatsapp_opt_in_source === STOP_SOURCE;
const staffStop = (r: Perm) => r.whatsapp_opt_in === false && !!r.whatsapp_opt_in_source?.startsWith(STAFF_STOP);
const SOURCE_WORDS: Record<string, string> = {
  'website-form': 'via the website form',
  'booking-form': 'via the booking form',
  'meta-lead-form': 'via the Meta lead form',
  inbound: 'when they messaged us',
  import: 'from an imported chat or lead',
};
function permissionWords(r: Perm): string {
  const src = r.whatsapp_opt_in_source ?? '';
  const on = r.whatsapp_opt_in_at ? ` on ${ukDate(r.whatsapp_opt_in_at)}` : '';
  if (repliedStop(r)) return `replied STOP${on}`;
  if (staffStop(r)) return `turned off by ${src.slice(STAFF_STOP.length) || 'staff'}${on}`;
  if (src.startsWith(NOT_ASKED)) return `not asked yet (checked by ${src.slice(NOT_ASKED.length) || 'staff'}${on})`;
  if (r.whatsapp_opt_in) return src.startsWith('staff:') ? `agreed${on} (recorded by ${src.slice(6) || 'staff'})` : `agreed${on}${SOURCE_WORDS[src] ? ` ${SOURCE_WORDS[src]}` : ''}`;
  return 'not agreed yet';
}

/**
 * WhatsApp permission belongs to the person (src/lib/whatsapp/permission.ts), so the merged customer gets:
 * 1. a STOP from either (their own STOP reply first, then staff switching it off): a withdrawal is never
 *    overruled by a merge, and only START or staff can lift it;
 * 2. else an agreement from either, the recorded one (when and how) first, the earliest of those;
 * 3. else a "Not asked" mark from the review list;
 * 4. else nothing.
 * `from`: whose three permission columns are copied, as they were.
 */
export function mergePermission(kept: Customer, other: Customer): { from: 'keep' | 'merge'; why: string } {
  const pair: [Customer, 'keep' | 'merge'][] = [
    [kept, 'keep'],
    [other, 'merge'],
  ];
  const ref = (who: 'keep' | 'merge') => (who === 'merge' ? ` (${refOf(other)})` : '');
  const stop = pair.find(([c]) => repliedStop(c)) ?? pair.find(([c]) => staffStop(c));
  if (stop) return { from: stop[1], why: `Automatic WhatsApps stay off: ${permissionWords(stop[0])}${ref(stop[1])}` };
  const agreed = pair.filter(([c]) => c.whatsapp_opt_in === true);
  if (agreed.length) {
    const recorded = agreed.filter(([c]) => c.whatsapp_opt_in_source).sort(([a], [b]) => text(a.whatsapp_opt_in_at).localeCompare(text(b.whatsapp_opt_in_at)) || 0);
    const [c, who] = recorded.find(([x]) => x.whatsapp_opt_in_at) ?? recorded[0] ?? agreed[0];
    return { from: who, why: `WhatsApp permission after merging: ${permissionWords(c)}${ref(who)}` };
  }
  const notAsked = pair.find(([c]) => c.whatsapp_opt_in_source?.startsWith(NOT_ASKED));
  if (notAsked) return { from: notAsked[1], why: `WhatsApp permission after merging: ${permissionWords(notAsked[0])}${ref(notAsked[1])}` };
  return { from: 'keep', why: 'WhatsApp permission after merging: not agreed yet' };
}

/* ── Aliases: old values that keep finding the record ───────────────────────────────── */

export type AliasKind = 'customer' | 'customer_ref' | 'job' | 'job_ref' | 'phone' | 'email' | 'meta_lead' | 'portal_token' | 'booking_token';
export type Alias = { kind: AliasKind; value: string; shown: string | null; from_ref: string | null; project_id: string | null };

/** How each kind is stored, so a lookup is one exact read: WhatsApp digits, lower-case email, references in capitals. */
export function aliasValue(kind: AliasKind, raw: unknown): string | null {
  const v = text(raw);
  if (!v) return null;
  if (kind === 'phone') return toWaId(v);
  if (kind === 'email') return goodEmail(v) ? v.toLowerCase() : null;
  if (kind === 'customer_ref' || kind === 'job_ref') return v.toUpperCase();
  if (kind === 'customer' || kind === 'job') return v.toLowerCase();
  return v;
}

/* ── Leads, for Reports ─────────────────────────────────────────────────────────────── */

/** The lead a job came in with: its own (from an earlier merge), else its customer's. */
export function originOf(f: Pick<JobFacts, 'job' | 'own'>, c: Customer): Origin {
  if (f.own) return { ...f.own, project_ref: f.own.project_ref ?? f.job.project_ref ?? null };
  return {
    enquiry_id: c.id,
    source: text(c.source) || 'unknown',
    came_in_at: c.created_at ?? null,
    job_created_at: f.job.created_at,
    first_contact_at: f.job.first_contact_at ?? null,
    owner_id: f.job.owner_id ?? null,
    meta_lead_id: c.meta_lead_id ?? null,
    meta_ad_id: c.meta_ad_id ?? null,
    meta_adset_id: c.meta_adset_id ?? null,
    meta_campaign_id: c.meta_campaign_id ?? null,
    customer_ref: c.customer_ref ?? null,
    project_ref: f.job.project_ref ?? null,
  };
}

/* ── Which jobs join ────────────────────────────────────────────────────────────────── */

/** Why two jobs can't be joined (they can still stay separate under one customer). */
export function pairBlockers(x: JobFacts, y: JobFacts): string[] {
  const out: string[] = [];
  const proof = (f: JobFacts) => f.signed || f.paid;
  if (proof(x) && proof(y)) out.push('Both jobs have a signed quote or a paid deposit.');
  // Kit ordered can put the other job first, but the signature and the payment can't move off theirs.
  else if (proof(orderPair(x, y).from)) out.push('The signed quote or paid deposit is on the job that would go (the other is further on, with kit ordered).');
  if (isProjectStage(x.job.stage) && isProjectStage(y.job.stage)) out.push('Both jobs are already projects (Won or later).');
  const answered = (f: JobFacts) => new Set(f.surveys.filter((s) => s.answered).map((s) => s.type));
  const both = [...answered(x)].filter((t) => answered(y).has(t));
  if (both.length) out.push('Both jobs have a survey with answers in it: finish or cancel one first.');
  if (x.job.rams_project_id && y.job.rams_project_id && x.job.rams_project_id !== y.job.rams_project_id) out.push('They’re linked to different RAMS projects.');
  return out;
}

/** In a joined pair, the job that stays: the one further on (a tie, the older). */
export function orderPair(x: JobFacts, y: JobFacts): { into: JobFacts; from: JobFacts } {
  const keepX = jobRank(x) > jobRank(y) || (jobRank(x) === jobRank(y) && x.job.created_at <= y.job.created_at);
  return keepX ? { into: x, from: y } : { into: y, from: x };
}

const siteKey = (j: Job, c: Customer) => postcodeKey(text(j.postcode) || text(c.postcode));

export type JoinChoice = {
  /** The merged-away customer's job (or, joining two of one customer's jobs, the one picked). */
  job: string;
  /** Joined by default with this one, or kept as its own job. */
  with: string | null;
  why: string;
  /** For each of the other customer's jobs: why it can't be joined with this one. */
  blocked: Record<string, string[]>;
};

/**
 * Each of the merged-away customer's jobs: joined by default with the kept customer's job only when each
 * has exactly one open job, at least one is still a sales job, they're for the same things (or either
 * has none yet), at the same postcode (or either has none), and nothing blocks it.
 */
export function joinChoices(kept: Side, other: Side): JoinChoice[] {
  const openK = kept.jobs.filter((f) => isOpen(f.job.stage));
  const openO = other.jobs.filter((f) => isOpen(f.job.stage));
  return other.jobs.map((f) => {
    const blocked = Object.fromEntries(kept.jobs.map((k) => [k.job.id, pairBlockers(k, f)]));
    const choice = (w: string | null, why: string): JoinChoice => ({ job: f.job.id, with: w, why, blocked });
    if (!kept.jobs.length) return choice(null, `${refOf(kept.customer)} has no job to join it with`);
    if (!isOpen(f.job.stage)) return choice(null, `It’s ${stageLabel(f.job.stage)}`);
    if (openK.length !== 1 || openO.length !== 1) return choice(null, 'They have more than one open job: pick one to join it with if it’s the same work');
    const k = openK[0];
    if (blocked[k.job.id].length) return choice(null, blocked[k.job.id][0]);
    const sales = (s: string) => (SALES_STAGES as string[]).includes(s);
    if (!sales(k.job.stage) && !sales(f.job.stage)) return choice(null, 'Both are projects already');
    const pk = k.job.products ?? [];
    const pf = f.job.products ?? [];
    if (pk.length && pf.length && !pk.some((p) => pf.includes(p))) return choice(null, 'They’re for different things');
    const a = siteKey(k.job, kept.customer);
    const b = siteKey(f.job, other.customer);
    if (a && b && a !== b) return choice(null, 'They’re at different addresses');
    return choice(k.job.id, 'Same work at the same address, both still open');
  });
}

/* ── A joined job ───────────────────────────────────────────────────────────────────── */

export type Change = { from: unknown; to: unknown };
export type Changes = Record<string, Change>;

const SURVEY_GROUP = ['survey_at', 'survey_type', 'survey_minutes', 'survey_mailbox', 'survey_booking_id', 'survey_event_id', 'survey_event_mailbox', 'survey_event_hash', 'survey_event_at'];
const INSTALL_GROUP = ['install_at', 'install_days', 'install_team', 'install_event_ids', 'install_event_mailbox', 'install_event_hash', 'install_event_until', 'scaffold_up_on', 'scaffold_down_on'];
const SITE_GROUP = ['address', 'postcode', 'site_lat', 'site_lng'];
const DNO_GROUP = ['dno_status', 'dno_ref', 'dno_submitted_at', 'dno_approved_at'];
/** The kept job's, unless it has none. */
const OR_THEIRS = ['value', 'owner_id', 'simpliheat_url', 'opensolar_url', 'rams_project_id', 'first_response_alerted_at', 'deposit_amount', 'commissioned_at', 'handover_at'];

const norm = (v: unknown) => JSON.stringify(v ?? null);

export type JoinedJob = {
  /** The kept job's changes, and the joined one's (what moves off it). */
  set: Changes;
  setFrom: Changes;
  /** Tasks made on the kept job ("From HX-0069: call back"). */
  tasks: { title: string; notes: string | null; due_date: string | null; assignee_id: string | null }[];
  /** Outlook events the kept job no longer owns. */
  tombstones: { mailbox: string; event_id: string }[];
  /** Whose live booking goes when both have one. */
  cancelBooking: 'from' | 'into';
  /** The survey date the job ends up with, and where it came from. */
  surveyFrom: 'into' | 'from' | null;
  /** In words, for the sheet. */
  notes: string[];
};

/**
 * What the kept job K ends up with when F joins it: K's value wins unless it's blank, lists are joined,
 * and the groups that belong together (the site, the survey and its Outlook copy, the install, the DNO)
 * come whole from one job. What moves off F (its links, its Outlook copy) is cleared on F, so nothing
 * unique is in two places and F's delete leaves Outlook alone. Only what really changes is listed, each
 * with the value read (the database checks it's still that).
 */
export function combineJobs(K: Job, F: Job, now: string): JoinedJob {
  const set: Changes = {};
  const setFrom: Changes = {};
  const notes: string[] = [];
  const tasks: JoinedJob['tasks'] = [];
  const tombstones: JoinedJob['tombstones'] = [];
  const put = (target: Changes, row: Job, col: string, to: unknown) => {
    if (!(col in row)) return; // not in the database yet
    if (norm(row[col]) !== norm(to)) target[col] = { from: row[col] ?? null, to: to ?? null };
  };
  const fRef = jobRef(F);

  // The kept job's own, unless it has none.
  for (const col of OR_THEIRS) if (blank(K[col]) && !blank(F[col])) put(set, K, col, F[col]);
  // Lists: both.
  const union = (a: unknown, b: unknown) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
  put(set, K, 'products', union(K.products, F.products));
  for (const col of ['reminders_sent', 'capi_sent']) if (col in K) put(set, K, col, union(K[col], F[col]));
  for (const col of ['system', 'paperwork', 'checklist']) {
    if (col in K && !emptyObj(F[col])) put(set, K, col, { ...(F[col] as object), ...((K[col] as object) ?? {}) });
  }

  // Groups, whole from one job.
  const has = (j: Job, cols: string[]) => cols.some((c) => !blank(j[c]));
  const copyGroup = (cols: string[]) => cols.forEach((c) => put(set, K, c, F[c]));
  if (!has(K, ['address', 'postcode']) && has(F, ['address', 'postcode'])) copyGroup(SITE_GROUP);
  const surveyK = has(K, ['survey_at', 'survey_booking_id']);
  const surveyF = has(F, ['survey_at', 'survey_booking_id']);
  let surveyFrom: JoinedJob['surveyFrom'] = surveyK ? 'into' : null;
  if (!surveyK && surveyF) {
    surveyFrom = 'from';
    copyGroup(SURVEY_GROUP);
    // F's Outlook copy is K's now; an old one K still had (cleared, waiting for the sync) is deleted.
    for (const c of ['survey_event_id', 'survey_event_mailbox', 'survey_booking_id']) put(setFrom, F, c, null);
    if (!blank(K.survey_event_id) && !blank(K.survey_event_mailbox) && K.survey_event_id !== F.survey_event_id) {
      tombstones.push({ mailbox: String(K.survey_event_mailbox), event_id: String(K.survey_event_id) });
    }
    notes.push(`The survey date comes from ${fRef}.`);
  }
  if (!has(K, ['install_at', 'install_event_ids', 'scaffold_up_on', 'scaffold_down_on']) && has(F, ['install_at', 'install_event_ids', 'scaffold_up_on', 'scaffold_down_on'])) {
    copyGroup(INSTALL_GROUP);
    put(setFrom, F, 'install_event_ids', []);
    put(setFrom, F, 'install_event_mailbox', null);
    put(setFrom, F, 'install_event_until', null);
    notes.push(`The install dates come from ${fRef}.`);
  }
  const dnoStarted = (j: Job) => (!blank(j.dno_status) && j.dno_status !== 'not_started') || !blank(j.dno_ref);
  if (!dnoStarted(K) && dnoStarted(F)) copyGroup(DNO_GROUP);

  // The next step: K's; both, F's becomes a task on K.
  if (blank(K.next_step) && !blank(F.next_step)) {
    for (const c of ['next_step', 'next_step_at', 'next_step_notified_at']) put(set, K, c, F[c]);
  } else if (!blank(K.next_step) && !blank(F.next_step) && text(K.next_step).toLowerCase() !== text(F.next_step).toLowerCase()) {
    tasks.push({
      title: `From ${fRef}: ${text(F.next_step)}`.slice(0, 300),
      notes: null,
      due_date: F.next_step_at ? ukDay(String(F.next_step_at)) : null,
      assignee_id: (K.owner_id as string | null) ?? (F.owner_id as string | null) ?? null,
    });
    notes.push(`Its next step (“${text(F.next_step)}”) becomes a task.`);
  }
  if (!blank(F.notes) && text(F.notes) !== text(K.notes)) put(set, K, 'notes', [text(K.notes), `From ${fRef}: ${text(F.notes)}`].filter(Boolean).join('\n\n'));

  // Speed to lead: never before the job was made (no negative response times in Reports).
  if (blank(K.first_contact_at) && !blank(F.first_contact_at)) {
    const f = String(F.first_contact_at);
    put(set, K, 'first_contact_at', Date.parse(f) > Date.parse(K.created_at) ? f : K.created_at);
  }
  // Follow-ups never restart: the furthest step, and stopped if either stopped.
  if ('sequence_step' in K) put(set, K, 'sequence_step', Math.max(Number(K.sequence_step) || 0, Number(F.sequence_step) || 0));
  if (blank(K.sequence_stopped_at) && !blank(F.sequence_stopped_at)) put(set, K, 'sequence_stopped_at', F.sequence_stopped_at);

  // The customer's links: K's; if K has none, F's moves over (else F's keeps working as an alias).
  for (const col of ['portal_token', 'booking_token']) {
    if (blank(K[col]) && !blank(F[col])) {
      put(setFrom, F, col, null);
      put(set, K, col, F[col]);
    }
  }
  // Always: the kept job's page reads it all again, and it's checked like the rest.
  if ('updated_at' in K) set.updated_at = { from: K.updated_at ?? null, to: now };
  return { set, setFrom, tasks, tombstones, cancelBooking: surveyFrom === 'from' ? 'into' : 'from', surveyFrom, notes };
}

/* ── Warnings ───────────────────────────────────────────────────────────────────────── */

/** Short forms of first names, so Rob and Robert Evans don't look like two people. */
const SHORT: Record<string, string> = {
  bob: 'robert', bobby: 'robert', bill: 'william', billy: 'william', will: 'william', liam: 'william', andy: 'andrew', drew: 'andrew',
  tony: 'anthony', jim: 'james', jimmy: 'james', jamie: 'james', mike: 'michael', mick: 'michael', steve: 'stephen', dave: 'david',
  liz: 'elizabeth', beth: 'elizabeth', betty: 'elizabeth', lizzie: 'elizabeth', kate: 'katherine', katie: 'katherine', cathy: 'catherine',
  sue: 'susan', jen: 'jennifer', jenny: 'jennifer', dick: 'richard', rich: 'richard', rick: 'richard', ted: 'edward', ed: 'edward',
  eddie: 'edward', harry: 'henry', jack: 'john', johnny: 'john', jon: 'jonathan', peggy: 'margaret', maggie: 'margaret', meg: 'margaret',
  nick: 'nicholas', pat: 'patricia', patty: 'patricia', penny: 'penelope', ron: 'ronald', sam: 'samuel', sandy: 'sandra', tom: 'thomas',
  tommy: 'thomas', vicky: 'victoria', wendy: 'gwendolyn', gwen: 'gwendolyn', huw: 'hugh', dai: 'david', ianto: 'ian',
};
const firstForm = (n: string) => SHORT[n] ?? n;
/** The same person's name, give or take case, spacing, a missing surname or a short form ("Rob Evans", "Robert Evans"). */
export function sameName(a: unknown, b: unknown): boolean {
  const words = (s: unknown) => text(s).toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return true;
  if (x.join(' ') === y.join(' ')) return true;
  const [fx, ...rx] = x;
  const [fy, ...ry] = y;
  const sur = (r: string[]) => r.at(-1) ?? '';
  if (rx.length && ry.length && sur(rx) !== sur(ry)) return false;
  return fx === fy || firstForm(fx) === firstForm(fy) || fx.startsWith(fy) || fy.startsWith(fx) || firstForm(fx).startsWith(fy) || firstForm(fy).startsWith(fx);
}

export type Warning = { text: string; tick?: string };

/* ── The plan ───────────────────────────────────────────────────────────────────────── */

export type Choices = {
  /** Which customer stays: 'a' or 'b' (the order they were picked in). */
  keep: 'a' | 'b';
  /** Each detail's value: the kept record's or the other's. Defaults as fieldRows says. */
  fields?: Partial<Record<FieldKey, 'keep' | 'merge'>>;
  /** For each of the merged-away customer's jobs: the kept customer's job it joins, or null for its own. */
  joins?: Record<string, string | null>;
  /** For each joined pair (by the merged-away customer's job): whose lead the sale counts for, the job that stays ('into') or the one joined into it ('from'). */
  credit?: Record<string, 'into' | 'from'>;
};

export type JoinPlan = {
  from: string;
  into: string;
  credit: 'into' | 'from';
  set: Changes;
  set_from: Changes;
  tasks: JoinedJob['tasks'];
  tombstones: JoinedJob['tombstones'];
  cancel_booking: 'from' | 'into';
  /** Null when both jobs came from the same lead (one customer's job made twice): it's counted once. */
  origin_from: Origin | null;
  origin_into: Origin;
};

/** What crm_merge() is given (supabase/merge.sql). */
export type SqlPlan = {
  keep: string;
  merge: string | null;
  expect: { table: 'enquiries' | 'crm_projects'; id: string; values: Row }[];
  customer: { set: Changes; clear: Changes } | null;
  joins: JoinPlan[];
  own_origins: (Origin & { project_id: string })[];
  aliases: Alias[];
  stop_sequences: string[];
  outbox_cancel_kinds: string[];
  policies: Record<string, ClashPolicy>;
  labels: { table: string; one: string; many: string }[];
  timeline: string;
  timeline_job: string | null;
  cancel_reason: string;
  files: { bucket: string; from: string; to: string }[];
  log: { joins: { from: string; from_ref: string | null; into: string; into_ref: string | null; credit: 'into' | 'from' }[]; choices: Row; warnings: string[] };
  by: string | null;
  by_name: string;
  dry_run: boolean;
};

export type JoinView = {
  /** The merged-away customer's job, and what's picked for it. */
  job: { id: string; ref: string | null; title: string | null; stage: string; products: string[] };
  with: string | null;
  why: string;
  options: { id: string; ref: string | null; title: string | null; stage: string; blocked: string[] }[];
  /** Picked: which job stays, and whose lead the sale counts for ('into': the one that stays). */
  stays: string | null;
  credit: 'into' | 'from';
  creditWords: { into: string; from: string } | null;
  notes: string[];
};

export type Planned = {
  kept: Side;
  other: Side;
  keepWhy: string;
  fields: FieldRow[];
  whatsapp: { waId: string | null; from: 'keep' | 'merge' | null; otherNumbers: string[] };
  permission: { from: 'keep' | 'merge'; why: string };
  joins: JoinView[];
  warnings: Warning[];
  plan: SqlPlan;
};

/** Customer columns the decisions read: the database checks they're still the same. */
const CUSTOMER_EXPECT = [
  'name', 'email', 'phone', 'postcode', 'interest', 'property_type', 'source', 'wa_id', 'wa_last_inbound_at', 'whatsapp_opt_in', 'whatsapp_opt_in_at',
  'whatsapp_opt_in_source', 'meta_lead_id', 'meta_ad_id', 'meta_adset_id', 'meta_campaign_id', 'meta_fbc',
];
const JOB_EXPECT = ['stage', 'updated_at', 'accepted_at', 'accepted_signature', 'deposit_paid_at', 'survey_at', 'survey_booking_id', 'portal_token', 'booking_token'];
const pickCols = (row: Row, cols: string[]) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c] ?? null]));
const showPhone = (n: string) => (n.startsWith('44') ? `0${n.slice(2, 6)} ${n.slice(6)}` : `+${n}`);

/**
 * Everything the merge sheet shows and crm_merge() does, from the two records (`a` and `b`, in the order
 * they were picked; `b` null to join two of one customer's jobs) and the person's choices. With no
 * choices: the defaults.
 */
export function planMerge(input: {
  a: Side;
  b: Side | null;
  choices: Choices;
  by: { id: string | null; name: string };
  now: string;
  dryRun?: boolean;
  /** Joining two of one customer's jobs (b null): [the job that goes, the one it joins]. */
  jobPair?: [string, string] | null;
}): Planned {
  const { a, b, choices, now } = input;
  const kept = !b || choices.keep === 'a' ? a : b;
  const other = !b ? a : choices.keep === 'a' ? b : a;
  const merging = !!b;
  const K = kept.customer;
  const O = other.customer;
  const keptRef = refOf(K);
  const otherRef = refOf(O);
  const cancelReason = `Merged into ${keptRef}`;

  // Details.
  const rows = merging ? fieldRows(K, O) : [];
  const fields = rows.map((r) => ({ ...r, pick: r.same ? 'keep' : (choices.fields?.[r.key] ?? r.pick) }) as FieldRow);
  const valueOf = (key: FieldKey) => {
    const r = fields.find((f) => f.key === key);
    return r?.pick === 'merge' ? O[key] : K[key];
  };
  const mainPhone = (valueOf('phone') as string | null) ?? null;
  const wa = merging ? chooseWhatsApp(kept, other, mainPhone) : { waId: K.wa_id ?? null, from: 'keep' as const };
  const permission = merging ? mergePermission(K, O) : { from: 'keep' as const, why: '' };

  const customer: SqlPlan['customer'] = merging ? { set: {}, clear: {} } : null;
  const setK = (col: string, to: unknown) => {
    if (customer && col in K && norm(K[col]) !== norm(to)) customer.set[col] = { from: K[col] ?? null, to: to ?? null };
  };
  if (customer) {
    for (const f of fields) if (f.pick === 'merge') setK(f.key, O[f.key]);
    if ('wa_id' in K) setK('wa_id', wa.waId);
    if (wa.from === 'merge' && 'wa_last_inbound_at' in K) setK('wa_last_inbound_at', O.wa_last_inbound_at ?? null);
    if (permission.from === 'merge') for (const col of ['whatsapp_opt_in', 'whatsapp_opt_in_at', 'whatsapp_opt_in_source']) setK(col, O[col]);
    // Meta's lead id: onto the kept record if it has none (the Conversions API and imports go by it); both, the other's is an alias.
    if (blank(K.meta_lead_id) && !blank(O.meta_lead_id) && 'meta_lead_id' in O) {
      customer.clear.meta_lead_id = { from: O.meta_lead_id, to: null };
      setK('meta_lead_id', O.meta_lead_id);
    }
    // The ad, only onto a record that isn't a Meta lead itself: Reports would count its own lead for the other's ad
    // (the other's lead keeps its ad in crm_lead_origins).
    const adCols = isMetaSource(text(K.source)) ? ['meta_fbc'] : ['meta_ad_id', 'meta_adset_id', 'meta_campaign_id', 'meta_fbc'];
    for (const col of adCols) if (blank(K[col]) && !blank(O[col])) setK(col, O[col]);
  }

  // Jobs.
  const byId = new Map([...kept.jobs, ...other.jobs].map((f) => [f.job.id, f]));
  const custOf = (f: JobFacts) => (f.job.enquiry_id === O.id ? O : K);
  const defaults = merging ? joinChoices(kept, other) : [];
  const pairs: { x: JobFacts; y: JobFacts; credit: 'into' | 'from' }[] = [];
  const joins: JoinView[] = [];
  if (merging) {
    // Each kept job takes one join per merge (each is worked out from the job as it is now).
    const taken = new Set<string>();
    for (const d of defaults) {
      const f = byId.get(d.job)!;
      const picked = choices.joins && d.job in choices.joins ? choices.joins[d.job] : d.with;
      const clash = !!picked && taken.has(picked);
      const w = picked && !clash && byId.get(picked) && kept.jobs.some((k) => k.job.id === picked) && !d.blocked[picked]?.length ? byId.get(picked)! : null;
      if (w) taken.add(w.job.id);
      const credit = choices.credit?.[d.job] ?? 'into';
      const view: JoinView = {
        job: { id: f.job.id, ref: f.job.project_ref ?? null, title: f.job.title, stage: f.job.stage, products: f.job.products ?? [] },
        with: w?.job.id ?? null,
        why: clash ? 'Another of their jobs is joining that one: after merging, join this one from ⋯ on its page' : d.why,
        options: kept.jobs.map((k) => ({ id: k.job.id, ref: k.job.project_ref ?? null, title: k.job.title, stage: k.job.stage, blocked: d.blocked[k.job.id] ?? [] })),
        stays: null,
        credit,
        creditWords: null,
        notes: [],
      };
      if (w) pairs.push({ x: w, y: f, credit });
      joins.push(view);
    }
  } else if (input.jobPair) {
    // Two of one customer's jobs: the one picked, joined with the other unless something blocks it.
    const [goes, into] = input.jobPair.map((id) => byId.get(id));
    if (goes && into) {
      const blocked = pairBlockers(into, goes);
      const opt = (f: JobFacts) => ({ id: f.job.id, ref: f.job.project_ref ?? null, title: f.job.title, stage: f.job.stage, blocked });
      joins.push({
        job: { id: goes.job.id, ref: goes.job.project_ref ?? null, title: goes.job.title, stage: goes.job.stage, products: goes.job.products ?? [] },
        with: blocked.length ? null : into.job.id,
        why: blocked[0] ?? 'Two jobs for the same customer',
        options: [opt(into)],
        stays: null,
        credit: 'into',
        creditWords: null,
        notes: [],
      });
      if (!blocked.length) pairs.push({ x: into, y: goes, credit: choices.credit?.[goes.job.id] ?? 'into' });
    }
  }

  const joinPlans: JoinPlan[] = [];
  const blockedPairs: string[] = [];
  for (const pr of pairs) {
    const { into, from } = orderPair(pr.x, pr.y);
    const blockers = pairBlockers(into, from);
    if (blockers.length) {
      blockedPairs.push(blockers[0]);
      continue;
    }
    const combined = combineJobs(into.job, from.job, now);
    const oFrom = originOf(from, custOf(from));
    const oInto = originOf(into, custOf(into));
    const sameLead = oFrom.enquiry_id === oInto.enquiry_id && oFrom.source === oInto.source && oFrom.came_in_at === oInto.came_in_at;
    const credit = sameLead ? 'into' : pr.credit;
    joinPlans.push({
      from: from.job.id,
      into: into.job.id,
      credit,
      set: combined.set,
      set_from: combined.setFrom,
      tasks: combined.tasks,
      tombstones: combined.tombstones,
      cancel_booking: combined.cancelBooking,
      origin_from: sameLead ? null : oFrom,
      origin_into: oInto,
    });
    const view = joins.find((j) => j.job.id === pr.y.job.id);
    if (view) {
      view.stays = into.job.id;
      view.creditWords = { into: leadSourceLabel(oInto.source), from: leadSourceLabel(oFrom.source) };
      view.notes = [...combined.notes, `${jobRef(into.job)} stays, at ${stageLabel(into.job.stage)}.`];
    }
  }
  const joinedAway = new Set(joinPlans.map((j) => j.from));
  const intoIds = new Set(joinPlans.map((j) => j.into));

  // Aliases: every old value that should still find them.
  const aliases: Alias[] = [];
  const alias = (kind: AliasKind, raw: unknown, shown: unknown, fromRef: string | null, projectId: string | null = null) => {
    const value = aliasValue(kind, raw);
    if (value && !aliases.some((x) => x.kind === kind && x.value === value)) aliases.push({ kind, value, shown: text(shown) || null, from_ref: fromRef, project_id: projectId });
  };
  const otherNumbers: string[] = [];
  if (merging) {
    alias('customer', O.id, null, otherRef);
    alias('customer_ref', O.customer_ref, O.customer_ref, otherRef);
    for (const [c, ref] of [
      [K, keptRef],
      [O, otherRef],
    ] as const) {
      for (const n of [c.phone, c.wa_id]) {
        const v = aliasValue('phone', n);
        // Every number but the one replies go to, their main phone too: inbox.ts only matches a phone that has no WhatsApp number.
        if (v && v !== wa.waId) {
          // As typed when it's their phone, else the WhatsApp number written the UK way.
          const typed = toWaId(c.phone) === v ? c.phone : showPhone(v);
          alias('phone', n, typed, ref);
          if (!otherNumbers.includes(String(typed))) otherNumbers.push(String(typed));
        }
      }
    }
    const email = aliasValue('email', valueOf('email'));
    for (const [c, ref] of [
      [K, keptRef],
      [O, otherRef],
    ] as const) {
      const v = aliasValue('email', c.email);
      if (v && v !== email) alias('email', v, c.email, ref);
    }
    if (!blank(K.meta_lead_id) && !blank(O.meta_lead_id) && K.meta_lead_id !== O.meta_lead_id) alias('meta_lead', O.meta_lead_id, null, otherRef);
  }
  for (const j of joinPlans) {
    const F = byId.get(j.from)!.job;
    const fRef = F.project_ref ?? null;
    alias('job', F.id, null, fRef, j.into);
    alias('job_ref', F.project_ref, F.project_ref, fRef, j.into);
    for (const col of ['portal_token', 'booking_token'] as const) if (!blank(F[col]) && !(col in j.set_from)) alias(col, F[col], null, fRef, j.into);
  }

  // Their jobs that move across (not joined) keep the lead they came in with, and stop chasing if the kept customer is further on.
  const own_origins = merging ? other.jobs.filter((f) => !joinedAway.has(f.job.id)).map((f) => ({ ...originOf(f, O), project_id: f.job.id })) : [];
  const keptBest = kept.jobs.filter((f) => isOpen(f.job.stage)).reduce((n, f) => Math.max(n, stageIndex(f.job.stage)), -1);
  const stop_sequences = merging
    ? other.jobs
        .filter((f) => !joinedAway.has(f.job.id) && !intoIds.has(f.job.id) && ['lead', 'contacted'].includes(f.job.stage) && keptBest > stageIndex('contacted'))
        .filter((f) => blank(f.job.sequence_stopped_at) && stageIndex(f.job.stage) < keptBest)
        .map((f) => f.job.id)
    : [];

  // What the person is told (and ticks where marked).
  const warnings: Warning[] = [];
  if (merging) {
    if (!sameName(K.name, O.name) && !placeholderName(K.name) && !placeholderName(O.name)) {
      warnings.push({ text: `The names are different: ${K.name} and ${O.name}.`, tick: 'Yes, it’s the same person (not a partner sharing a phone or email)' });
    }
    const pa = postcodeKey(text(K.postcode));
    const pb = postcodeKey(text(O.postcode));
    if (pa && pb && pa !== pb && ukPostcode(pa) && ukPostcode(pb)) warnings.push({ text: `Two postcodes (${K.postcode} and ${O.postcode}): two properties? Jobs at different addresses stay separate.` });
    if (wa.waId) {
      const others = otherNumbers.filter((n) => toWaId(n) !== wa.waId);
      const kept = others.length === 1 ? 'stays on their record as another number' : 'stay on their record as other numbers';
      warnings.push({ text: `WhatsApp replies will go to ${showPhone(wa.waId)}.${others.length ? ` ${others.join(', ')} ${kept}, for search and incoming messages.` : ''}` });
    }
    // Automatic WhatsApps cancelled: the database's dry run counts them ("Cancelled: …" in the sheet).
    for (const s of other.outbox.scheduled) {
      const when = new Date(s.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
      warnings.push({ text: `A message ${s.by ?? 'someone'} scheduled for ${when} will go to ${wa.waId ? showPhone(wa.waId) : 'the main number'}.` });
    }
    warnings.push({ text: permission.why });
  }
  // A survey booked or a survey date (one set by phone, say): never two on one job.
  const hasSurvey = (f: JobFacts) => !!f.booking || !blank(f.job.survey_at) || !blank(f.job.survey_booking_id);
  for (const j of joinPlans) {
    const F = byId.get(j.from)!;
    const Kf = byId.get(j.into)!;
    if (hasSurvey(F) && hasSurvey(Kf)) {
      const gone = j.cancel_booking === 'from' ? F : Kf;
      const at = gone.booking?.start ?? (blank(gone.job.survey_at) ? null : String(gone.job.survey_at));
      const when = at ? ` (${ukDate(at)})` : '';
      warnings.push({ text: `Both jobs have a survey booked: the ${jobRef(gone.job)} one${when} is cancelled and taken out of Outlook.`, tick: `I’ll tell ${K.name.split(/\s+/)[0] || 'them'} if they booked both` });
    }
    if (F.waitingQuote && Kf.waitingQuote) warnings.push({ text: `${jobRef(F.job)}’s quote waiting to be signed stops asking for a signature: ${jobRef(Kf.job)}’s is the one in their portal.` });
  }
  const contracts = [...kept.jobs, ...other.jobs].filter((f) => hasContract(f));
  for (const f of contracts) {
    const what = [f.signed && 'a signed quote', f.paid && 'a paid deposit', f.ordersSent && plural(f.ordersSent, 'purchase order') + ' sent'].filter(Boolean).join(', ');
    warnings.push({ text: `${jobRef(f.job)} has ${what}.` });
    // Signed by someone whose name isn't the one the record keeps: worth a look before merging.
    const signedAs = text(f.job.accepted_name);
    const keptName = text(merging ? valueOf('name') : K.name);
    if (signedAs && !sameName(signedAs, keptName)) warnings.push({ text: `${jobRef(f.job)}’s quote was signed as “${signedAs}”, not ${keptName}.` });
  }
  for (const b2 of blockedPairs) warnings.push({ text: `Not joined: ${b2} They stay as separate jobs.` });

  // The timeline line on the kept customer.
  const joinedWords = joinPlans.map((j) => `Job ${jobRef(byId.get(j.from)!.job)} joined ${jobRef(byId.get(j.into)!.job)}.`).join(' ');
  const timeline = merging
    ? `Merged ${[O.name, O.customer_ref].filter(Boolean).join(' ')} (${leadSourceLabel(O.source)}, came in ${ukDate(O.created_at)}) into this record: {moved}.${joinedWords ? ` ${joinedWords}` : ''} By ${input.by.name}.`
    : `${joinedWords || 'Jobs joined.'} Moved: {moved}. By ${input.by.name}.`;

  const allJobs = [...kept.jobs, ...(merging ? other.jobs : [])];
  const plan: SqlPlan = {
    keep: K.id,
    merge: merging ? O.id : null,
    expect: [
      ...(merging ? [K, O] : [K]).map((c) => ({ table: 'enquiries' as const, id: c.id, values: pickCols(c, CUSTOMER_EXPECT) })),
      ...allJobs.map((f) => ({ table: 'crm_projects' as const, id: f.job.id, values: pickCols(f.job, intoIds.has(f.job.id) ? JOB_EXPECT.filter((c) => c !== 'updated_at') : JOB_EXPECT) })),
    ],
    customer,
    joins: joinPlans,
    own_origins,
    aliases,
    stop_sequences,
    outbox_cancel_kinds: ['reply', 'intro', 'chase'],
    policies: clashPolicies(),
    labels: summaryLabels(),
    timeline: timeline.replace(/\s{2,}/g, ' '),
    timeline_job: joinPlans[0]?.into ?? bestJob(kept)?.job.id ?? null,
    cancel_reason: cancelReason,
    files: folderMoves({ merge: merging ? O.id : null, keep: K.id, joins: joinPlans }),
    log: {
      joins: joinPlans.map((j) => ({ from: j.from, from_ref: byId.get(j.from)!.job.project_ref ?? null, into: j.into, into_ref: byId.get(j.into)!.job.project_ref ?? null, credit: j.credit })),
      choices: {
        keep: choices.keep,
        fields: Object.fromEntries(fields.map((f) => [f.key, { pick: f.pick, why: f.why }])),
        whatsapp: wa,
        permission,
      },
      warnings: warnings.map((w) => w.text),
    },
    by: input.by.id,
    by_name: input.by.name,
    dry_run: !!input.dryRun,
  };
  const suggested = b ? suggestKeep(a, b) : null;
  const keepWhy = !suggested ? '' : suggested.keep === choices.keep ? `Suggested: ${suggested.why}` : 'You picked this one';
  return { kept, other, keepWhy, fields, whatsapp: { ...wa, otherNumbers }, permission, joins, warnings, plan };
}

/**
 * What the check before Merge compares (sha256 of it, in merge.ts): both customers' details, each job's
 * stage and last change, contracts, live bookings and waiting messages. Not message counts: those change
 * all the time and change nothing about the merge.
 */
export function checkInput(a: Side, b: Side | null): string {
  const side = (s: Side) => ({
    c: pickCols(s.customer, ['id', ...CUSTOMER_EXPECT]),
    j: s.jobs.map((f) => [f.job.id, f.job.stage, f.job.updated_at ?? null, f.signed, f.paid, f.ordersSent, f.booking?.id ?? null, f.surveys.map((x) => `${x.id}:${x.answered}`)]),
    o: [s.outbox.automatic, s.outbox.scheduled.length],
  });
  return JSON.stringify([side(a), b ? side(b) : null]);
}
