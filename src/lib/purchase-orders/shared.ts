/**
 * Purchase orders as the API sends them (/api/crm/purchase-orders, /api/crm/suppliers). Types and
 * small helpers only, so they're safe in the browser. The money and the status rules are in
 * money.ts.
 */

export type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  account_number: string | null;
  address: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  /** How many orders use it (the suppliers list): one that's been used is archived, never deleted. */
  orders?: number;
};

export type PoLine = {
  id?: string;
  position: number;
  description: string;
  part_number: string | null;
  qty: number;
  /** Ex VAT. Null: not priced yet. */
  unit_cost_pence: number | null;
  vat_rate: number;
  received_qty: number | null;
};

export type DeliverTo = 'site' | 'office' | 'collect';

export type PurchaseOrder = {
  id: string;
  po_number: string;
  project_id: string;
  supplier_id: string;
  status: string;
  deliver_to: DeliverTo;
  deliver_address: string | null;
  deliver_postcode: string | null;
  required_by: string | null;
  notes: string | null;
  internal_note: string | null;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  sent_at: string | null;
  sent_to: string | null;
  sent_by: string | null;
  changed_since_sent: boolean;
  confirmed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  supplier_invoice_ref: string | null;
  supplier_invoice_pence: number | null;
  paid_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The job an order is for: its reference (HX-0042-2, or the customer's before customer-refs.sql), customer and site. */
export type PoJob = {
  id: string;
  title: string;
  stage: string;
  ref: string | null;
  customer: string;
  customer_id: string;
  address: string | null;
  postcode: string | null;
};

export type PoListRow = PurchaseOrder & {
  supplier: { id: string; name: string; email: string | null } | null;
  job: PoJob | null;
  lines: number;
};

/** One order with everything its sheet shows. */
export type PoFull = {
  order: PurchaseOrder;
  lines: PoLine[];
  supplier: Supplier | null;
  job: PoJob | null;
  /** Who made it and who last sent it. */
  people: { created_by: string | null; sent_by: string | null };
  /** The office / warehouse address from CRM settings (null until it's set). */
  office: Office | null;
  /** Microsoft 365 is set up, so the app can email suppliers. */
  email: boolean;
};

export type Office = { address: string; postcode: string | null };

/** A job's orders at a glance (the Overview's "Kit ordered"). */
export type OrdersSummary = {
  count: number;
  drafts: number;
  /** Sent or confirmed: ordered, not delivered yet. */
  open: number;
  /** Ex VAT, on every order that's gone to a supplier and isn't cancelled. */
  orderedNet: number;
  /** The earliest required-by date of the open orders (it may be past: late). */
  nextDelivery: string | null;
};

/** What a new order on this job starts with: lines from the job (no prices), and where it can go. */
export type PoSuggestion = {
  lines: { description: string; part_number: string | null; qty: number | null; vat_rate: number }[];
  /** Where the lines came from, in words ("the job’s system details"), or empty. */
  from: string[];
  site: { address: string | null; postcode: string | null };
  office: Office | null;
  email: boolean;
};

/** The summary from a job's orders (the server's and the Orders tab's, so they always agree). */
export function summariseOrders(rows: { status: string; net_pence: number | string | null; required_by: string | null }[]): OrdersSummary {
  const open = rows.filter((r) => r.status === 'sent' || r.status === 'confirmed');
  const dates = open.map((r) => r.required_by).filter((d): d is string => !!d).sort();
  return {
    count: rows.length,
    drafts: rows.filter((r) => r.status === 'draft').length,
    open: open.length,
    orderedNet: rows.filter((r) => r.status === 'sent' || r.status === 'confirmed' || r.status === 'delivered').reduce((n, r) => n + (Number(r.net_pence) || 0), 0),
    nextDelivery: dates[0] ?? null,
  };
}

export const DELIVER_LABEL: Record<DeliverTo, string> = { site: 'To the site', office: 'To the office', collect: 'We’ll collect' };

export const isEmail = (s: unknown): s is string => typeof s === 'string' && s.length <= 200 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);

/** "12 High Street, Newport" + "NP20 4AB" on one line, without the postcode twice. */
export function addressLine(address: string | null | undefined, postcode: string | null | undefined): string {
  const a = (address || '').replace(/\s*\n\s*/g, ', ').trim();
  const pc = (postcode || '').trim();
  if (!a) return pc;
  return pc && !a.toUpperCase().includes(pc.toUpperCase()) ? `${a}, ${pc}` : a;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Tuesday 3 November" for a YYYY-MM-DD day (by hand: browsers disagree about the comma). */
export function dayWords(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * The email that goes with the PO (the sheet shows it to edit first): short and plain, with the
 * delivery, the date it's needed and "please quote the PO number". `replaces`: the day the version
 * it replaces was sent (a changed order going again).
 */
export function defaultPoMessage(o: {
  po_number: string;
  jobRef: string | null;
  required_by: string | null;
  deliver_to: DeliverTo;
  deliver_address: string | null;
  deliver_postcode: string | null;
  contact: string | null;
  sender: string | null;
  replaces?: string | null;
}): string {
  const hello = (o.contact || '').trim().split(/\s+/)[0] || 'there';
  const where =
    o.deliver_to === 'collect'
      ? 'We’ll collect it: please let us know when it’s ready.'
      : `Please deliver to ${o.deliver_to === 'office' ? 'our office' : 'site'}: ${addressLine(o.deliver_address, o.deliver_postcode)}.`;
  return [
    `Hello ${hello},`,
    '',
    `Please find attached our purchase order ${o.po_number}${o.jobRef ? ` for job ${o.jobRef}` : ''}.${o.replaces ? ` It replaces the version we sent on ${dayWords(o.replaces)}.` : ''}`,
    [o.required_by ? `We need it by ${dayWords(o.required_by)}.` : '', where].filter(Boolean).join(' '),
    '',
    `Please quote ${o.po_number} on your delivery note and invoice, and reply to confirm the order.`,
    '',
    'Thanks,',
    o.sender || 'The Heliaxis team',
    'Heliaxis',
  ].join('\n');
}
