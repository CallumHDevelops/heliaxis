import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukDay } from '@/lib/bank-holidays';
import { getCrmSettings } from '@/lib/crm/crm-settings';
import { logActivity } from '@/lib/crm/server';
import { mailbox, msConfigured } from '@/lib/ms365';
import { readAll, withFallback } from '@/lib/projects/server';
import { schemaReady } from '@/lib/schema-ready';
import { HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';
import { formatPence, isDay, stillChanged, totals, type CleanLine } from './money';
import type { PoPdfInput } from './pdf';
import { matchesOrder, summariseOrders, type DeliverTo, type Office, type OrdersSummary, type PoFull, type PoJob, type PoLine, type PoListRow, type PoSuggestion, type PurchaseOrder, type Supplier } from './shared';

/**
 * Purchase orders on the server: reading orders with their lines, supplier and job, the list and
 * its filters, a job's "Kit ordered" summary, what a new order starts with, saving lines (with
 * their totals, in one database call) and the timeline entries. purchase-orders.sql makes the
 * tables; until it's run `ordersReady()` is false and the routes say so.
 */

type Db = ReturnType<typeof createAdminClient>;
type PgError = { code?: string; message?: string } | null;

export const NOT_READY = 'Purchase orders aren’t set up yet: run purchase-orders.sql from your to-do list.';
export const ordersReady = async () => (await schemaReady()).purchaseOrders;

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v));
const text = (v: unknown) => (typeof v === 'string' ? v : null);

/** A purchase_orders row with its numbers as numbers (PostgREST can send bigints as strings). */
function orderRow(r: Record<string, unknown>): PurchaseOrder {
  return {
    ...(r as unknown as PurchaseOrder),
    net_pence: num(r.net_pence),
    vat_pence: num(r.vat_pence),
    gross_pence: num(r.gross_pence),
    supplier_invoice_pence: numOrNull(r.supplier_invoice_pence),
    changed_since_sent: stillChanged(String(r.status ?? ''), r.changed_since_sent),
  };
}

function lineRow(r: Record<string, unknown>): PoLine {
  return {
    id: String(r.id),
    position: num(r.position),
    description: String(r.description ?? ''),
    part_number: text(r.part_number),
    qty: num(r.qty),
    unit_cost_pence: numOrNull(r.unit_cost_pence),
    vat_rate: num(r.vat_rate),
    received_qty: numOrNull(r.received_qty),
  };
}

/* ── Jobs ────────────────────────────────────────────────────────────────────── */

type JobRow = { id: string; enquiry_id: string; title: string; stage: string; address: string | null; postcode: string | null; project_ref: string | null };
type Cust = { id: string; name: string; postcode: string | null; customer_ref?: string | null };

/** The jobs these orders are for, with their customer and reference. */
export async function jobsFor(db: Db, projectIds: string[]): Promise<Map<string, PoJob>> {
  const jobs = await readAll<JobRow>(projectIds, (b, from, to) =>
    db.from('crm_projects').select('id, enquiry_id, title, stage, address, postcode, project_ref').in('id', b).order('id').range(from, to)
  );
  type Res = { data: Cust[] | null; error: PgError };
  const customers = await readAll<Cust>(
    jobs.map((j) => j.enquiry_id),
    (b, from, to) =>
      withFallback<Cust>((cols) => db.from('enquiries').select(cols).in('id', b).order('id').range(from, to) as unknown as PromiseLike<Res>, 'id, name, postcode', 'customer_ref')
  );
  const cust = new Map(customers.map((c) => [c.id, c]));
  return new Map(
    jobs.map((j) => {
      const c = cust.get(j.enquiry_id);
      return [
        j.id,
        {
          id: j.id,
          title: j.title,
          stage: j.stage,
          ref: j.project_ref || c?.customer_ref || null,
          customer: c?.name ?? '',
          customer_id: j.enquiry_id,
          address: j.address,
          postcode: j.postcode || c?.postcode || null,
        },
      ];
    })
  );
}

/* ── Reading ─────────────────────────────────────────────────────────────────── */

export async function officeOf(): Promise<Office | null> {
  const s = await getCrmSettings();
  return s.officeAddress.trim() ? { address: s.officeAddress.trim(), postcode: s.officePostcode.trim() || null } : null;
}

const nameOf = async (db: Db, ids: (string | null)[]) => {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map<string, string>();
  const { data } = await db.from('profiles').select('id, full_name, email').in('id', want);
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team') as string]));
};

/** One order with its lines, supplier, job, and the people's names. Null if it isn't there. */
export async function readOrder(db: Db, id: string): Promise<PoFull | null> {
  const { data: raw } = await db.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (!raw) return null;
  const order = orderRow(raw);
  const [{ data: lines }, { data: supplier }, jobs, office, names] = await Promise.all([
    db.from('purchase_order_lines').select('*').eq('purchase_order_id', id).order('position'),
    db.from('suppliers').select('*').eq('id', order.supplier_id).maybeSingle(),
    jobsFor(db, [order.project_id]),
    officeOf(),
    nameOf(db, [order.created_by, order.sent_by]),
  ]);
  return {
    order,
    lines: (lines ?? []).map(lineRow),
    supplier: (supplier as Supplier | null) ?? null,
    job: jobs.get(order.project_id) ?? null,
    people: { created_by: order.created_by ? (names.get(order.created_by) ?? null) : null, sent_by: order.sent_by ? (names.get(order.sent_by) ?? null) : null },
    office,
    email: msConfigured(),
  };
}

export type ListFilters = {
  /** One status, or 'open' (sent or confirmed). */
  status?: string | null;
  supplier?: string | null;
  project?: string | null;
  /** PO number, job reference or customer name. */
  q?: string | null;
  /** Open orders needed by this day (YYYY-MM-DD) or before. */
  due?: string | null;
};

const LIST_MAX = 2000;

/** Orders, newest first, with their supplier and job (up to 2,000, filtered as asked). */
export async function listOrders(db: Db, f: ListFilters = {}): Promise<PoListRow[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < LIST_MAX; from += 1000) {
    let q = db.from('purchase_orders').select('*').order('created_at', { ascending: false }).order('id').range(from, from + 999);
    if (f.status === 'open') q = q.in('status', ['sent', 'confirmed']);
    else if (f.status) q = q.eq('status', f.status);
    if (f.supplier) q = q.eq('supplier_id', f.supplier);
    if (f.project) q = q.eq('project_id', f.project);
    if (f.due && isDay(f.due)) q = q.in('status', ['sent', 'confirmed']).lte('required_by', f.due);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const orders = rows.map(orderRow);
  const ids = orders.map((o) => o.id);
  const [suppliers, jobs, lineCounts] = await Promise.all([
    readAll<{ id: string; name: string; email: string | null }>(
      orders.map((o) => o.supplier_id),
      (b, from, to) => db.from('suppliers').select('id, name, email').in('id', b).order('id').range(from, to)
    ),
    jobsFor(
      db,
      orders.map((o) => o.project_id)
    ),
    readAll<{ purchase_order_id: string }>(ids, (b, from, to) => db.from('purchase_order_lines').select('purchase_order_id').in('purchase_order_id', b).order('id').range(from, to)),
  ]);
  const sup = new Map(suppliers.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  for (const l of lineCounts) counts.set(l.purchase_order_id, (counts.get(l.purchase_order_id) ?? 0) + 1);
  const list = orders.map((o) => ({ ...o, supplier: sup.get(o.supplier_id) ?? null, job: jobs.get(o.project_id) ?? null, lines: counts.get(o.id) ?? 0 }));
  const q = (f.q ?? '').trim().toLowerCase();
  return q ? list.filter((o) => matchesOrder(o, q)) : list;
}

/** A job's orders at a glance, or null before purchase-orders.sql (or if the read fails). Never throws. */
export async function ordersSummary(db: Db, projectId: string): Promise<OrdersSummary | null> {
  try {
    const { data, error } = await db.from('purchase_orders').select('status, net_pence, required_by').eq('project_id', projectId);
    return error ? null : summariseOrders((data ?? []) as { status: string; net_pence: number | null; required_by: string | null }[]);
  } catch {
    return null;
  }
}

/* ── A new order: lines from the job, never prices ───────────────────────────── */

const fmt = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? String(v).trim() : '');
const count = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 10_000 ? Math.round(n * 1000) / 1000 : null;
};

/**
 * What a new order on this job starts with: a line per piece of kit the job records (Job details →
 * System details, then the latest solar survey's suggested system for anything not filled in there),
 * with the make and model and how many where they're known. Unit costs are always left blank, for
 * the supplier's price. With neither, a line per product on the job, quantity blank.
 */
export async function suggestFor(db: Db, projectId: string): Promise<PoSuggestion | null> {
  const { data: p } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  if (!p) return null;
  const [jobs, office, survey] = await Promise.all([
    jobsFor(db, [projectId]),
    officeOf(),
    db
      .from('crm_surveys')
      .select('answers, status, completed_at, updated_at')
      .eq('project_id', projectId)
      .eq('type', 'solar')
      .neq('status', 'cancelled')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(
        (r) => (r.error ? null : ((r.data?.[0] as { answers?: Record<string, unknown> } | undefined) ?? null)),
        () => null
      ),
  ]);
  const sys = (p.system && typeof p.system === 'object' ? p.system : {}) as Record<string, unknown>;
  const z1 = (survey?.answers?.Z1 && typeof survey.answers.Z1 === 'object' ? survey.answers.Z1 : {}) as Record<string, unknown>;
  const products = (Array.isArray(p.products) ? p.products : []) as string[];
  const lines: PoSuggestion['lines'] = [];
  const from = new Set<string>();
  const add = (description: string, qty: number | null, source: 'job' | 'survey') => {
    lines.push({ description: description.slice(0, 300), part_number: null, qty, vat_rate: 20 });
    from.add(source === 'job' ? 'the job’s system details' : 'the solar survey’s suggested system');
  };

  // Solar panels: the model and count from the job, else the survey's count (and size).
  const panelModel = fmt(sys.panel_model);
  const panels = count(sys.panel_count) ?? count(z1.panels);
  if (panelModel || panels) {
    const kwp = fmt(sys.kwp) || fmt(z1.kwp);
    // The system's size helps only when there's no model to go on.
    add(`Solar panel${panelModel ? `: ${panelModel}` : kwp ? ` (${kwp} kWp system)` : ''}`, panels, panelModel || count(sys.panel_count) ? 'job' : 'survey');
  }
  const inverter = fmt(sys.inverter_model) || fmt(z1.inverter);
  const inverterKw = fmt(sys.inverter_kw) || fmt(z1.inverterKw);
  if (inverter || inverterKw) add(`Inverter${inverter ? `: ${inverter}` : ''}${inverterKw ? ` (${inverterKw} kW)` : ''}`, 1, fmt(sys.inverter_model) || fmt(sys.inverter_kw) ? 'job' : 'survey');
  const battery = fmt(sys.battery_model);
  const batteryKwh = fmt(sys.battery_kwh) || fmt(z1.batteryKwh);
  if (battery || batteryKwh) add(`Battery${battery ? `: ${battery}` : ''}${batteryKwh ? ` (${batteryKwh} kWh)` : ''}`, 1, battery || fmt(sys.battery_kwh) ? 'job' : 'survey');
  const heatPump = fmt(sys.heat_pump_model);
  const heatPumpKw = fmt(sys.heat_pump_kw);
  if (heatPump || heatPumpKw) add(`Heat pump${heatPump ? `: ${heatPump}` : ''}${heatPumpKw ? ` (${heatPumpKw} kW)` : ''}`, 1, 'job');
  const charger = fmt(sys.ev_charger_model);
  if (charger) add(`EV charger: ${charger}`, 1, 'job');

  // Nothing recorded yet: one line per product on the job, to fill in.
  if (!lines.length) {
    const WORDS: Record<string, string> = {
      solar: 'Solar panels',
      battery: 'Battery',
      heatpump: 'Heat pump',
      ev: 'EV charger',
      infrared: 'Infrared heating panels',
      led: 'LED lighting',
    };
    for (const k of products) if (WORDS[k]) lines.push({ description: WORDS[k], part_number: null, qty: null, vat_rate: 20 });
    if (lines.length) from.add('the products on the job');
  }
  const job = jobs.get(projectId);
  return {
    lines,
    from: [...from],
    site: { address: job?.address ?? null, postcode: job?.postcode ?? null },
    office,
    email: msConfigured(),
  };
}

/* ── Saving ──────────────────────────────────────────────────────────────────── */

/** Replace the order's lines and their totals in one database call (purchase_order_save_lines). */
export async function saveLines(db: Db, orderId: string, lines: CleanLine[]): Promise<string | null> {
  const t = totals(lines);
  const { error } = await db.rpc('purchase_order_save_lines', {
    p_order: orderId,
    p_lines: lines.map((l, position) => ({ ...l, position })),
    p_net: t.net,
    p_vat: t.vatTotal,
    p_gross: t.gross,
  });
  return error ? error.message : null;
}

/** The lines as saved, in the shape cleanLines gives, to see whether an edit changed them. */
type Comparable = { description: string; part_number: string | null; qty: number; unit_cost_pence: number | null; vat_rate: number };
export const sameLines = (a: Comparable[], b: Comparable[]) =>
  JSON.stringify(a.map((l) => [l.description, l.part_number ?? null, Number(l.qty), l.unit_cost_pence ?? null, Number(l.vat_rate)])) ===
  JSON.stringify(b.map((l) => [l.description, l.part_number ?? null, Number(l.qty), l.unit_cost_pence ?? null, Number(l.vat_rate)]));

/** Where it goes: the site's address as typed (prefilled from the job), the office's from CRM settings, or nothing (collect). */
export async function deliveryFor(
  to: unknown,
  b: { deliver_address?: unknown; deliver_postcode?: unknown }
): Promise<{ ok: true; deliver_to: DeliverTo; deliver_address: string | null; deliver_postcode: string | null } | { ok: false; error: string }> {
  if (to === 'collect') return { ok: true, deliver_to: 'collect', deliver_address: null, deliver_postcode: null };
  if (to === 'office') {
    const office = await officeOf();
    if (!office) return { ok: false, error: 'There’s no office address yet. Add it in CRM settings → Purchase orders first.' };
    return { ok: true, deliver_to: 'office', deliver_address: office.address, deliver_postcode: office.postcode };
  }
  if (to !== 'site') return { ok: false, error: 'Choose where it’s delivered.' };
  const address = String(b.deliver_address ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 300);
  const postcode = String(b.deliver_postcode ?? '').trim().toUpperCase().slice(0, 10);
  if (!address && !postcode) return { ok: false, error: 'Add the site address, so the supplier knows where to deliver.' };
  return { ok: true, deliver_to: 'site', deliver_address: address || null, deliver_postcode: postcode || null };
}

/* ── The job's timeline ──────────────────────────────────────────────────────── */

export type PoEvent = 'created' | 'sent' | 'confirmed' | 'delivered' | 'undelivered' | 'cancelled' | 'deleted';

/** A line on the job's timeline (Activity), linked to the order. Never throws. */
export async function logOrder(db: Db, o: Pick<PurchaseOrder, 'id' | 'po_number' | 'project_id'>, event: PoEvent, body: string, byId: string | null) {
  try {
    const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', o.project_id).maybeSingle();
    if (!p) return;
    await logActivity({
      enquiryId: String(p.enquiry_id),
      projectId: o.project_id,
      kind: 'system',
      body,
      meta: { purchase_order: o.id, po_number: o.po_number, event },
      byId,
    });
  } catch {
    // The order is saved either way.
  }
}

/** "PO-0003 (CEF Newport, £1,074.00 ex VAT)". */
export const orderWords = (o: Pick<PurchaseOrder, 'po_number' | 'net_pence'>, supplier: string | null | undefined) =>
  `${o.po_number} (${[supplier, o.net_pence ? `${formatPence(o.net_pence)} ex VAT` : ''].filter(Boolean).join(', ')})`;

/* ── The PDF ─────────────────────────────────────────────────────────────────── */

/**
 * What the PDF shows for this order as it stands: dated the day it was sent (today for a draft, or a
 * changed order about to go again, which then says which one it replaces). `by`: who's sending it
 * now; else whoever sent it last, or made it.
 */
export function pdfInputFor(full: PoFull, by?: string | null): PoPdfInput {
  const o = full.order;
  const today = ukDay(Date.now());
  const again = !!o.sent_at && stillChanged(o.status, o.changed_since_sent);
  return {
    order: o,
    lines: full.lines,
    supplier: full.supplier,
    jobRef: full.job?.ref ?? null,
    issued: o.sent_at && !again ? ukDay(o.sent_at) : today,
    replaces: again ? ukDay(o.sent_at!) : null,
    orderedBy: by ?? full.people.sent_by ?? full.people.created_by,
    contactEmail: mailbox() || HELIAXIS_PARTY.noticesEmail,
  };
}
