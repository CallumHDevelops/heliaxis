import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { json, logActivity } from '@/lib/crm/server';
import { schemaReady } from '@/lib/schema-ready';
import { DEFAULT_RATES } from '@/lib/subcontractors/agreement';
import { cleanAssignment, mobileProblem, moneyLine, vatFor, waIdOf, isEmail, type MoneyLine } from './assign';
import { designOf } from './design';
import { formsFor, isElectricianForm, suggestedTrades } from './forms';
import { legacySections } from './forms/legacy';
import { defaultCertRoute } from './forms/electrician/cert';
import { cisPercent, cisWords, isCisRate, parseAgreedRate, type CisRate, type RateBasis, type VatTreatment } from './money';
import { getSiteSettings } from './settings';
import { jobStrip, type StripStep } from './strip';
import { snapshotOf, type HeldReason } from './po-shared';
import { returnView, stageStates, type PoReview, type ReturnView, type ReviewState, type ReviewStatus } from './review-shared';
import { STATUS_LABEL, TRADE_LABEL, valuesOf, yesNo, type Answers, type AssignmentStatus, type Flag, type Stage, type Trade } from './types';

/**
 * The site app on the server: whether its SQL has run, the people who go to site (a firm's contact or
 * a quick contact), the trades on a job with their rate, VAT and CIS, and the Site tab's view of
 * them. site-commissioning.sql makes the tables; until it's run `siteReady()` is false and every
 * site route answers 503 with the to-do.
 */

export type Db = ReturnType<typeof createAdminClient>;

export const SITE_NOT_READY = 'Run site-commissioning.sql from your to-do list';
export const siteReady = async () => (await schemaReady()).site;
/** What every site route says before the SQL has been run. */
export const notReady = () => json({ error: SITE_NOT_READY, ready: false }, 503);

/* ── People ──────────────────────────────────────────────────────────────────── */

export type ContactRow = {
  id: string;
  subcontractor_id: string | null;
  operative_id: string | null;
  name: string;
  company: string | null;
  email: string | null;
  mobile: string | null;
  wa_id: string | null;
  whatsapp_ok: boolean;
  whatsapp_ok_at: string | null;
  whatsapp_ok_by: string | null;
  trades: string[];
  scheme: string | null;
  scheme_number: string | null;
  part_p_by: 'self' | 'heliaxis' | null;
  instruments: unknown[];
  vat_number: string | null;
  cis_rate: CisRate | null;
  cis_verified_on: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A subcontractor firm, read with select('*') (the CIS verification columns come from portal-v3.sql). */
export type FirmRow = {
  id: string;
  ref: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  trade: string | null;
  status: string;
  rate_option: 'default' | 'bespoke';
  bespoke_rates: { trade: string; rate: string; basis: string }[] | null;
  details: { vatNumber?: string; legalName?: string } | null;
  cis_verified_on?: string | null;
  cis_rate?: string | null;
};

/** A firm's free-text trade ("Roofer", "Solar PV installer") as a site trade. */
export function tradeKeyOf(text: string | null | undefined): Trade | null {
  const t = (text || '').toLowerCase();
  if (!t) return null;
  if (/scaff/.test(t)) return 'scaffolder';
  if (/roof/.test(t)) return 'roofer';
  if (/electric|bess|solar|battery|ev charg/.test(t)) return 'electrician';
  return 'other';
}

/** What the person's POs depend on: VAT registered or not, and their CIS verification (the firm's, or their own as a quick contact). */
export function moneyFacts(c: Pick<ContactRow, 'vat_number' | 'cis_rate' | 'cis_verified_on'>, firm: FirmRow | null) {
  if (firm) {
    const vat = (firm.details?.vatNumber || '').trim();
    return { vatRegistered: !!vat, vatNumber: vat || null, cis: { verifiedOn: firm.cis_verified_on ?? null, rate: isCisRate(firm.cis_rate) ? firm.cis_rate : null } };
  }
  const vat = (c.vat_number || '').trim();
  return { vatRegistered: !!vat, vatNumber: vat || null, cis: { verifiedOn: c.cis_verified_on, rate: c.cis_rate } };
}

/**
 * The rate in the firm's agreement for this trade, only when it's plain ("£30.00 per panel"): their
 * bespoke rates if they signed those, else the agreement's default rates. Two possible rows, or
 * anything vague ("£30–35", "To be agreed"), gives nothing: the office types it.
 */
export function agreedRate(firm: FirmRow | null, trade: Trade): { pence: number; basis: RateBasis; text: string } | null {
  if (!firm) return null;
  const rows = firm.rate_option === 'bespoke' ? (firm.bespoke_rates ?? []) : DEFAULT_RATES;
  const mine = rows.filter((r) => tradeKeyOf(r.trade) === trade);
  if (mine.length !== 1) return null;
  const parsed = parseAgreedRate(mine[0].rate);
  return parsed ? { ...parsed, text: mine[0].rate } : null;
}

export async function firmsById(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, FirmRow>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const { data } = await db.from('subcontractors').select('*').in('id', want);
  return new Map(((data ?? []) as FirmRow[]).map((f) => [f.id, f]));
}

/**
 * The firm's main contact on site (the person on their agreement), made the first time the firm is
 * picked for a job, from the details the firm gave: name, email and mobile.
 */
export async function ensureFirmContact(db: Db, firm: FirmRow, byId: string | null): Promise<ContactRow | null> {
  const { data: have } = await db
    .from('site_contacts')
    .select('*')
    .eq('subcontractor_id', firm.id)
    .is('operative_id', null)
    .is('archived_at', null)
    .order('created_at')
    .limit(1);
  if (have?.length) return have[0] as ContactRow;
  const trade = tradeKeyOf(firm.trade);
  const { data, error } = await db
    .from('site_contacts')
    .insert({
      subcontractor_id: firm.id,
      name: (firm.contact_name || firm.company_name).slice(0, 120),
      company: firm.details?.legalName || firm.company_name,
      email: firm.email || null,
      mobile: firm.phone || null,
      wa_id: waIdOf(firm.phone),
      trades: trade ? [trade] : [],
      created_by: byId,
    })
    .select('*')
    .single();
  return error ? null : (data as ContactRow);
}

/** One person in the picker: "Dave Price · Price Roofing · roofer · 07700 900123". */
export type PickRow = {
  /** An existing site contact, or a firm whose main contact is made when it's picked. */
  contact_id: string | null;
  firm_id: string | null;
  name: string;
  company: string | null;
  trades: string[];
  mobile: string | null;
  email: string | null;
  label: string;
  vat_registered: boolean;
  cis: string;
  /** The firm's agreed rate for the trade asked about, when it's plain. */
  rate: { pence: number; basis: RateBasis; text: string } | null;
  firm_status: string | null;
  /** HMRC verification, for the PO preview. */
  cis_facts: { verifiedOn: string | null | undefined; rate: CisRate | null | undefined };
};

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (hay: (string | null | undefined)[], q: string) => {
  const h = hay.filter(Boolean).join(' ').toLowerCase();
  return words(q).every((w) => h.includes(w));
};

/** Search the people who go to site: their own site contacts and subcontractor firms (not terminated), the asked-for trade first. */
export async function searchPeople(db: Db, q: string, trade: Trade | null): Promise<PickRow[]> {
  const [{ data: contacts }, { data: firms }] = await Promise.all([
    db.from('site_contacts').select('*').is('archived_at', null).order('name').limit(1000),
    db.from('subcontractors').select('*').neq('status', 'terminated').order('company_name').limit(1000),
  ]);
  const firmMap = new Map(((firms ?? []) as FirmRow[]).map((f) => [f.id, f]));
  const rows: PickRow[] = [];
  const hasMain = new Set<string>();
  for (const c of (contacts ?? []) as ContactRow[]) {
    const firm = c.subcontractor_id ? (firmMap.get(c.subcontractor_id) ?? null) : null;
    if (firm && !c.operative_id) hasMain.add(firm.id);
    const company = firm?.company_name ?? c.company;
    const trades = c.trades?.length ? c.trades : firm ? [tradeKeyOf(firm.trade) ?? 'other'] : [];
    if (q && !matches([c.name, company, c.mobile, c.email, ...trades], q)) continue;
    const m = moneyFacts(c, firm);
    rows.push({
      contact_id: c.id,
      firm_id: firm?.id ?? null,
      name: c.name,
      company,
      trades,
      mobile: c.mobile,
      email: c.email,
      label: [c.name, company, trades.join(', '), c.mobile].filter(Boolean).join(' · '),
      vat_registered: m.vatRegistered,
      cis: cisWords(m.cis),
      rate: trade ? agreedRate(firm, trade) : null,
      firm_status: firm?.status ?? null,
      cis_facts: m.cis,
    });
  }
  for (const f of (firms ?? []) as FirmRow[]) {
    if (hasMain.has(f.id)) continue;
    const t = tradeKeyOf(f.trade);
    if (q && !matches([f.company_name, f.contact_name, f.trade, f.phone, f.email], q)) continue;
    const m = moneyFacts({ vat_number: null, cis_rate: null, cis_verified_on: null }, f);
    rows.push({
      contact_id: null,
      firm_id: f.id,
      name: f.contact_name || f.company_name,
      company: f.company_name,
      trades: t ? [t] : [],
      mobile: f.phone,
      email: f.email,
      label: [f.contact_name, f.company_name, t ?? f.trade, f.phone].filter(Boolean).join(' · '),
      vat_registered: m.vatRegistered,
      cis: cisWords(m.cis),
      rate: trade ? agreedRate(f, trade) : null,
      firm_status: f.status,
      cis_facts: m.cis,
    });
  }
  // The trade asked about first, then by name.
  const rank = (r: PickRow) => (trade && r.trades.includes(trade) ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 40);
}

/** A quick contact as typed (name, company, email, mobile), checked. */
export function cleanContact(b: Record<string, unknown>, partial = false): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  const given = (k: string) => !partial || k in b;
  if (given('name')) {
    const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name) return { ok: false, error: 'Add their name.' };
    out.name = name;
  }
  if (given('company')) out.company = String(b.company ?? '').trim().slice(0, 120) || null;
  if (given('email')) {
    const email = String(b.email ?? '').trim();
    if (email && !isEmail(email)) return { ok: false, error: 'That email address doesn’t look right.' };
    out.email = email || null;
  }
  if (given('mobile')) {
    const mobile = String(b.mobile ?? '').trim().slice(0, 30);
    const problem = mobileProblem(mobile);
    if (problem) return { ok: false, error: problem };
    out.mobile = mobile || null;
    out.wa_id = waIdOf(mobile);
  }
  if (given('vat_number')) out.vat_number = String(b.vat_number ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 20) || null;
  if (given('trades')) out.trades = (Array.isArray(b.trades) ? b.trades : []).map(String).filter((t) => ['roofer', 'scaffolder', 'electrician', 'other'].includes(t));
  if ('scheme' in b) out.scheme = String(b.scheme ?? '').trim().slice(0, 40) || null;
  if ('scheme_number' in b) out.scheme_number = String(b.scheme_number ?? '').trim().slice(0, 40) || null;
  if ('part_p_by' in b) out.part_p_by = b.part_p_by === 'self' || b.part_p_by === 'heliaxis' ? b.part_p_by : null;
  return { ok: true, fields: out };
}

/* ── Assignments ─────────────────────────────────────────────────────────────── */

export type AssignmentRow = {
  id: string;
  project_id: string;
  contact_id: string;
  trade: Trade;
  trade_label: string | null;
  scope: string | null;
  forms: string[];
  cert_route: string;
  starts_on: string | null;
  days: number | null;
  rate_pence: number | null;
  rate_basis: RateBasis | null;
  rate_qty: number | null;
  raise_po: boolean;
  vat_treatment: VatTreatment | null;
  vat_note: string | null;
  cis_override: CisRate | null;
  share_customer_phone: boolean;
  note_to_trade: string | null;
  status: AssignmentStatus;
  link_hash: string | null;
  link_generation: number;
  link_created_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  started_at: string | null;
  signed_at: string | null;
  done_at: string | null;
  cancelled_at: string | null;
  answers: Answers;
  rev: number;
  answers_saved_at: string | null;
  flags: Flag[];
  schema_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** A row with its numbers as numbers (PostgREST can send bigints and numerics as strings). */
export function assignmentRow(r: Record<string, unknown>): AssignmentRow {
  const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
  return {
    ...(r as unknown as AssignmentRow),
    rate_pence: n(r.rate_pence),
    rate_qty: n(r.rate_qty),
    days: n(r.days),
    rev: Number(r.rev ?? 0),
    link_generation: Number(r.link_generation ?? 0),
    forms: Array.isArray(r.forms) ? legacySections(r.forms as string[]) : [],
    answers: (r.answers && typeof r.answers === 'object' ? r.answers : {}) as Answers,
    flags: Array.isArray(r.flags) ? (r.flags as Flag[]) : [],
  };
}

export async function readAssignment(db: Db, id: string): Promise<AssignmentRow | null> {
  const { data } = await db.from('site_assignments').select('*').eq('id', id).maybeSingle();
  return data ? assignmentRow(data) : null;
}

/** A line on the assignment's history (site_events). Never throws. */
export async function logSiteEvent(db: Db, assignmentId: string | null, actor: string, type: string, detail?: Record<string, unknown> | null, ip?: string | null) {
  try {
    await db.from('site_events').insert({ assignment_id: assignmentId, actor, type, detail: detail ?? null, ip: ip ?? null });
  } catch {
    // The history is a record, never a blocker.
  }
}

/** A line on the job's timeline for site work. Never throws. */
export async function logJob(db: Db, projectId: string, body: string, meta: Record<string, unknown>, byId: string | null) {
  try {
    const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', projectId).maybeSingle();
    if (p) await logActivity({ enquiryId: String(p.enquiry_id), projectId, kind: 'system', body, meta: { site: true, ...meta }, byId });
  } catch {
    // The change is saved either way.
  }
}

/** A new assignment from the Site tab or New project: who (a contact, a firm, or a new person) and the fields. */
export type NewAssignment = Record<string, unknown> & {
  contact_id?: unknown;
  firm_id?: unknown;
  new_contact?: unknown;
  vat_treatment?: unknown;
  forms?: unknown;
};

/**
 * Put trades on a job. Each gets its person (made first when it's a firm picked for the first time,
 * or a new quick contact), the agreed rate and basis, the VAT (refused when it can't be right: VAT
 * from someone not VAT registered, or nothing chosen for someone who is) and, for electricians, the
 * paperwork for the job's technologies. All or nothing: a problem with one adds none. 422 for the
 * VAT and person problems, 400 for the rest.
 */
export async function createAssignments(
  db: Db,
  projectId: string,
  inputs: NewAssignment[],
  byId: string | null
): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; error: string }> {
  if (!inputs.length) return { ok: true, ids: [] };
  if (inputs.length > 12) return { ok: false, status: 400, error: '12 trades at most at once.' };
  const { data: project } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  if (!project) return { ok: false, status: 404, error: 'That job isn’t there any more.' };
  const settings = await getSiteSettings();
  const products = (Array.isArray(project.products) ? project.products : []) as string[];
  const design = designOf(project.system as Record<string, unknown> | null);

  // Check everything first.
  type Ready = { person: { contactId?: string; firmId?: string; fresh?: Record<string, unknown> }; fields: Record<string, unknown> };
  const ready: Ready[] = [];
  const contactIds = inputs.map((i) => String(i.contact_id ?? '')).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const { data: contactRows } = contactIds.length ? await db.from('site_contacts').select('*').in('id', contactIds) : { data: [] };
  const contacts = new Map(((contactRows ?? []) as ContactRow[]).map((c) => [c.id, c]));
  const firms = await firmsById(db, [...((contactRows ?? []) as ContactRow[]).map((c) => c.subcontractor_id), ...inputs.map((i) => (typeof i.firm_id === 'string' ? i.firm_id : null))]);
  for (const [n, input] of inputs.entries()) {
    const at = inputs.length > 1 ? `Trade ${n + 1}: ` : '';
    const clean = cleanAssignment(input, false);
    if (!clean.ok) return { ok: false, status: 400, error: at + clean.error };
    let contact: ContactRow | null = null;
    let firm: FirmRow | null = null;
    let fresh: Record<string, unknown> | undefined;
    if (typeof input.contact_id === 'string' && input.contact_id) {
      contact = contacts.get(input.contact_id) ?? null;
      if (!contact || contact.archived_at) return { ok: false, status: 422, error: `${at}That person isn’t there any more.` };
      firm = contact.subcontractor_id ? (firms.get(contact.subcontractor_id) ?? null) : null;
    } else if (typeof input.firm_id === 'string' && input.firm_id) {
      firm = firms.get(input.firm_id) ?? null;
      if (!firm || firm.status === 'terminated') return { ok: false, status: 422, error: `${at}That subcontractor can’t be given work.` };
    } else if (input.new_contact && typeof input.new_contact === 'object') {
      const c = cleanContact(input.new_contact as Record<string, unknown>);
      if (!c.ok) return { ok: false, status: 422, error: at + c.error };
      fresh = { ...c.fields, trades: [clean.fields.trade] };
    } else return { ok: false, status: 400, error: `${at}Choose who’s doing it.` };
    const facts = moneyFacts(
      contact ?? { vat_number: (fresh?.vat_number as string | null) ?? null, cis_rate: null, cis_verified_on: null },
      firm
    );
    const vat = vatFor(facts.vatRegistered, input.vat_treatment, settings.vatDefault);
    if (!vat.ok) return { ok: false, status: 422, error: at + vat.error };
    const forms =
      clean.fields.trade === 'electrician'
        ? Array.isArray(input.forms)
          ? (input.forms as unknown[]).filter(isElectricianForm)
          : formsFor(products, design)
        : [];
    ready.push({
      person: { contactId: contact?.id, firmId: !contact ? firm?.id : undefined, fresh },
      fields: {
        ...clean.fields,
        vat_treatment: vat.value,
        vat_note: String(input.vat_note ?? '').trim().slice(0, 200) || null,
        forms,
        ...(clean.fields.trade === 'electrician' && !clean.fields.cert_route ? { cert_route: defaultCertRoute() } : {}),
      },
    });
  }

  // Then make them.
  const ids: string[] = [];
  for (const r of ready) {
    let contactId = r.person.contactId ?? null;
    if (!contactId && r.person.firmId) contactId = (await ensureFirmContact(db, firms.get(r.person.firmId)!, byId))?.id ?? null;
    if (!contactId && r.person.fresh) {
      const { data, error } = await db
        .from('site_contacts')
        .insert({ ...r.person.fresh, created_by: byId })
        .select('id')
        .single();
      if (error) return { ok: false, status: 500, error: error.message };
      contactId = data.id as string;
    }
    if (!contactId) return { ok: false, status: 500, error: 'Couldn’t save the person. Try again.' };
    const { data, error } = await db
      .from('site_assignments')
      .insert({ project_id: projectId, contact_id: contactId, ...r.fields, created_by: byId })
      .select('id, trade')
      .single();
    if (error) return { ok: false, status: 500, error: error.message };
    ids.push(data.id as string);
    await logSiteEvent(db, data.id as string, byId ?? 'system', 'created', { trade: data.trade });
  }
  return { ok: true, ids };
}

/* ── The Site tab ────────────────────────────────────────────────────────────── */

export type SiteMessageView = { id: string; channel: 'email' | 'whatsapp'; kind: string; status: string; send_after: string; sent_at: string | null; error: string | null };

export type AssignmentView = {
  id: string;
  trade: Trade;
  trade_label: string | null;
  /** "Roofer", or the label for "other". */
  title: string;
  scope: string | null;
  status: AssignmentStatus;
  status_label: string;
  starts_on: string | null;
  days: number | null;
  contact: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    mobile: string | null;
    wa_id: string | null;
    whatsapp_ok: boolean;
    firm_id: string | null;
    firm_ref: string | null;
    firm_status: string | null;
    vat_registered: boolean;
    cis_facts: { verifiedOn: string | null | undefined; rate: CisRate | null | undefined };
  };
  rate_pence: number | null;
  rate_basis: RateBasis | null;
  rate_qty: number | null;
  raise_po: boolean;
  vat_treatment: VatTreatment | null;
  vat_note: string | null;
  /** Not VAT registered: the VAT line is locked to "no VAT". */
  vat_locked: boolean;
  cis_override: CisRate | null;
  money: MoneyLine;
  /** The firm's agreed rate for this trade, when it's plain (the "From their agreement" chip). */
  agreed: { pence: number; basis: RateBasis; text: string } | null;
  share_customer_phone: boolean;
  note_to_trade: string | null;
  forms: string[];
  /** Forms the job's technologies now call for that this electrician hasn't got. */
  forms_missing: string[];
  cert_route: string;
  sent_at: string | null;
  opened_at: string | null;
  signed_at: string | null;
  last_synced: string | null;
  photos: number;
  flags: Flag[];
  open_flags: number;
  po: PoView | null;
  /** The office's review of each signed submission: waiting, return to site (open or put right), green light. */
  review: { signoff_id: string; stage: Stage; state: ReviewState; live: ReturnView | null }[];
  messages: SiteMessageView[];
  link: { generation: number; created_at: string | null; phones: number };
  /** The scaffold: was it tagged at erection (SC3)? */
  tagged: boolean | null;
};

/** A trade's labour PO on the Site tab: what it's held for, and whether it has gone and changed since. */
export type PoView = {
  id: string;
  po_number: string;
  status: string;
  payable_pence: number | null;
  /** 0 until it's issued; 2 after Issue again… */
  version: number;
  issued: string | null;
  sent_at: string | null;
  held: HeldReason[];
  changed_since_sent: boolean;
  /** The office's review of the work: waiting, hold (return to site), green. Null before anything's signed. */
  review: PoReview | null;
};

export type SiteTabData = {
  ready: true;
  job: { id: string; ref: string | null; stage: string; products: string[]; site: string; scaffold_up_on: string | null; scaffold_down_on: string | null };
  strip: StripStep[];
  assignments: AssignmentView[];
  /** The trades the products suggest that aren't on the job yet. */
  suggested: Trade[];
  vatDefault: string;
};

const siteLine = (address: unknown, postcode: unknown) => {
  const a = String(address ?? '').replace(/\s*\n\s*/g, ', ').trim();
  const pc = String(postcode ?? '').trim();
  return a ? (pc && !a.toUpperCase().includes(pc.toUpperCase()) ? `${a}, ${pc}` : a) : pc;
};

export async function siteTabData(db: Db, projectId: string): Promise<SiteTabData | null> {
  const { data: p } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  if (!p) return null;
  const [{ data: rows }, settings, { data: cust }] = await Promise.all([
    db.from('site_assignments').select('*').eq('project_id', projectId).order('created_at'),
    getSiteSettings(),
    db.from('enquiries').select('postcode').eq('id', p.enquiry_id).maybeSingle(),
  ]);
  const list = (rows ?? []).map(assignmentRow);
  const ids = list.map((a) => a.id);
  const contactIds = [...new Set(list.map((a) => a.contact_id))];
  const [{ data: contactRows }, { data: photos }, { data: orders }, { data: messages }, { data: devices }, { data: signoffRows }, { data: returnRows }] = await Promise.all([
    contactIds.length ? db.from('site_contacts').select('*').in('id', contactIds) : Promise.resolve({ data: [] as unknown[] }),
    ids.length ? db.from('crm_photos').select('assignment_id').in('assignment_id', ids) : Promise.resolve({ data: [] as unknown[] }),
    ids.length ? db.from('purchase_orders').select('*').in('assignment_id', ids).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as unknown[] }),
    ids.length ? db.from('site_messages').select('id, assignment_id, channel, kind, status, send_after, sent_at, error, created_at').in('assignment_id', ids).order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] as unknown[] }),
    contactIds.length ? db.from('site_devices').select('contact_id, revoked_at').in('contact_id', contactIds) : Promise.resolve({ data: [] as unknown[] }),
    ids.length ? db.from('site_signoffs').select('id, assignment_id, stage, signed_at, review_status').in('assignment_id', ids).order('signed_at') : Promise.resolve({ data: [] as unknown[] }),
    ids.length ? db.from('site_returns').select('*').in('assignment_id', ids).neq('status', 'withdrawn').order('n') : Promise.resolve({ data: [] as unknown[] }),
  ]);
  // The office's review of each assignment's signed submissions.
  const reviewOf = new Map<string, AssignmentView['review']>();
  for (const id of ids) {
    const so = ((signoffRows ?? []) as { id: string; assignment_id: string; stage: Stage; review_status: ReviewStatus | null }[]).filter((s) => s.assignment_id === id);
    const rt = ((returnRows ?? []) as Record<string, unknown>[]).filter((r) => r.assignment_id === id).map(returnView);
    const states = stageStates(so.map((s) => ({ stage: s.stage, review: s.review_status })), rt);
    reviewOf.set(id, states.map((x, i) => ({ signoff_id: so[i].id, stage: x.stage, state: x.state, live: x.live })));
  }
  const contacts = new Map(((contactRows ?? []) as ContactRow[]).map((c) => [c.id, c]));
  const firms = await firmsById(db, [...contacts.values()].map((c) => c.subcontractor_id));
  const photoCount = new Map<string, number>();
  for (const r of (photos ?? []) as { assignment_id: string }[]) photoCount.set(r.assignment_id, (photoCount.get(r.assignment_id) ?? 0) + 1);
  const poOf = new Map<string, PoView>();
  for (const o of (orders ?? []) as Record<string, unknown>[]) {
    const a = String(o.assignment_id);
    if (poOf.has(a) || o.status === 'cancelled') continue;
    const snap = snapshotOf(o.labour);
    poOf.set(a, {
      id: String(o.id),
      po_number: String(o.po_number),
      status: String(o.status),
      payable_pence: o.payable_pence == null ? null : Number(o.payable_pence),
      version: snap?.version ?? 0,
      issued: snap?.issued ?? null,
      sent_at: (o.sent_at as string | null) ?? null,
      held: o.status === 'draft' ? (snap?.held ?? []) : [],
      changed_since_sent: o.changed_since_sent === true,
      review: o.review_status === 'waiting' || o.review_status === 'hold' || o.review_status === 'green' ? o.review_status : null,
    });
  }
  const msgOf = new Map<string, SiteMessageView[]>();
  for (const m of (messages ?? []) as (SiteMessageView & { assignment_id: string })[]) {
    const { assignment_id, ...rest } = m;
    msgOf.set(assignment_id, [...(msgOf.get(assignment_id) ?? []), rest]);
  }
  const phones = new Map<string, number>();
  for (const d of (devices ?? []) as { contact_id: string; revoked_at: string | null }[]) if (!d.revoked_at) phones.set(d.contact_id, (phones.get(d.contact_id) ?? 0) + 1);

  const products = (Array.isArray(p.products) ? p.products : []) as string[];
  const design = designOf(p.system as Record<string, unknown> | null);
  const views: AssignmentView[] = [];
  for (const a of list) {
    const c = contacts.get(a.contact_id);
    if (!c) continue;
    const firm = c.subcontractor_id ? (firms.get(c.subcontractor_id) ?? null) : null;
    const facts = moneyFacts(c, firm);
    const answers = valuesOf(a.answers);
    const panels = typeof answers.RX5 === 'number' ? answers.RX5 : null;
    const money = moneyLine({ ...a, cis: { ...facts.cis, override: a.cis_override }, panels: a.status === 'signed' || a.status === 'done' ? panels : null });
    views.push({
      id: a.id,
      trade: a.trade,
      trade_label: a.trade_label,
      title: a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade],
      scope: a.scope,
      status: a.status,
      status_label: STATUS_LABEL[a.status] ?? a.status,
      starts_on: a.starts_on,
      days: a.days,
      contact: {
        id: c.id,
        name: c.name,
        company: firm?.company_name ?? c.company,
        email: c.email,
        mobile: c.mobile,
        wa_id: c.wa_id,
        whatsapp_ok: c.whatsapp_ok,
        firm_id: firm?.id ?? null,
        firm_ref: firm?.ref ?? null,
        firm_status: firm?.status ?? null,
        vat_registered: facts.vatRegistered,
        cis_facts: facts.cis,
      },
      rate_pence: a.rate_pence,
      rate_basis: a.rate_basis,
      rate_qty: a.rate_qty,
      raise_po: a.raise_po,
      vat_treatment: a.vat_treatment,
      vat_note: a.vat_note,
      vat_locked: !facts.vatRegistered,
      cis_override: a.cis_override,
      money,
      agreed: agreedRate(firm, a.trade),
      share_customer_phone: a.share_customer_phone,
      note_to_trade: a.note_to_trade,
      forms: a.forms,
      forms_missing: a.trade === 'electrician' && a.status !== 'cancelled' ? formsFor(products, design).filter((f) => !a.forms.includes(f)) : [],
      cert_route: a.cert_route,
      sent_at: a.sent_at,
      opened_at: a.opened_at,
      signed_at: a.signed_at,
      last_synced: a.answers_saved_at,
      photos: photoCount.get(a.id) ?? 0,
      flags: a.flags,
      open_flags: a.flags.filter((f) => !f.resolved_at).length,
      po: poOf.get(a.id) ?? null,
      review: reviewOf.get(a.id) ?? [],
      messages: msgOf.get(a.id) ?? [],
      link: { generation: a.link_generation, created_at: a.link_created_at, phones: phones.get(c.id) ?? 0 },
      tagged: yesNo(answers.SC3),
    });
  }
  const live = views.filter((v) => v.status !== 'cancelled');
  const struck = (v: AssignmentView) => v.status === 'done';
  const strip = jobStrip({
    scaffold: live.filter((v) => v.trade === 'scaffolder').map((v) => ({ status: v.status, tagged: v.tagged, struck: struck(v) })),
    roof: live.filter((v) => v.trade === 'roofer').map((v) => ({ status: v.status })),
    electrics: live.filter((v) => v.trade === 'electrician').map((v) => ({ status: v.status })),
    scaffold_up_on: (p.scaffold_up_on as string | null) ?? null,
    handover_at: (p.handover_at as string | null) ?? null,
  });
  return {
    ready: true,
    job: {
      id: projectId,
      ref: (p.project_ref as string | null) ?? null,
      stage: String(p.stage),
      products,
      site: siteLine(p.address, p.postcode || cust?.postcode),
      scaffold_up_on: (p.scaffold_up_on as string | null) ?? null,
      scaffold_down_on: (p.scaffold_down_on as string | null) ?? null,
    },
    strip,
    assignments: views,
    suggested: suggestedTrades(products).filter((t) => !live.some((v) => v.trade === t)),
    vatDefault: settings.vatDefault,
  };
}

/** CIS % for an assignment's person, as the PO will deduct it (cisPercent with the job's change). */
export function cisPercentFor(c: Pick<ContactRow, 'vat_number' | 'cis_rate' | 'cis_verified_on'>, firm: FirmRow | null, override: CisRate | null) {
  return cisPercent({ ...moneyFacts(c, firm).cis, override });
}
