/**
 * Purchase orders: the money (all in whole pence) and what can change in each status. Pure and
 * browser-safe (no imports), so the sheet's live totals, the API, the PDF and
 * scripts/test-purchase-orders.mjs all work them out the same way.
 *
 * Money: each line is qty × unit cost (ex VAT), rounded half-up to the penny. VAT is worked out once
 * per rate on the lines at that rate (half-up), as a VAT invoice does, not line by line, so twelve
 * £0.99 items at 20% come to £2.38 VAT, not 12 × 20p. Gross is net + VAT.
 */

/* ── Limits (the API refuses anything outside them) ──────────────────────────── */

export const VAT_RATES = [20, 5, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const isVatRate = (v: unknown): v is VatRate => VAT_RATES.includes(v as VatRate);

export const MAX_LINES = 100;
/** Per line, to 3 decimal places (2.5 m of cable). */
export const MAX_QTY = 10_000;
/** £100,000 per unit. With MAX_QTY, every sum stays well inside whole-number range. */
export const MAX_UNIT_PENCE = 10_000_000;
/** Their invoice total: £10m. */
export const MAX_INVOICE_PENCE = 1_000_000_000;
export const MAX_DESCRIPTION = 300;
export const MAX_PART_NUMBER = 60;

/* ── Money ───────────────────────────────────────────────────────────────────── */

/** a ÷ b rounded half-up, for whole numbers a ≥ 0 and b > 0 (exact: no floating point). */
const divHalfUp = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));

/** A quantity in thousandths (2.5 → 2500), the unit lines are multiplied in. */
const thousandths = (qty: number) => Math.round(qty * 1000);

export type MoneyLine = { qty: number; unit_cost_pence: number | null; vat_rate: number };

/** One line's net in pence: qty × unit cost, half-up. A line not priced yet counts as nothing. */
export function lineNet(l: MoneyLine): number {
  if (l.unit_cost_pence == null || !(l.qty > 0)) return 0;
  return divHalfUp(thousandths(l.qty) * l.unit_cost_pence, 1000);
}

export type VatGroup = { rate: number; net: number; vat: number };
export type Totals = {
  /** Each line's net, in the same order. */
  lines: number[];
  net: number;
  /** One per rate that has lines, highest rate first. */
  vat: VatGroup[];
  vatTotal: number;
  gross: number;
  /** Lines with no unit cost yet. */
  unpriced: number;
};

export function totals(lines: MoneyLine[]): Totals {
  const nets = lines.map(lineNet);
  const byRate = new Map<number, number>();
  lines.forEach((l, i) => byRate.set(l.vat_rate, (byRate.get(l.vat_rate) ?? 0) + nets[i]));
  const vat = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, net]) => ({ rate, net, vat: divHalfUp(net * rate, 100) }));
  const net = nets.reduce((n, x) => n + x, 0);
  const vatTotal = vat.reduce((n, g) => n + g.vat, 0);
  return { lines: nets, net, vat, vatTotal, gross: net + vatTotal, unpriced: lines.filter((l) => l.unit_cost_pence == null).length };
}

const GBP = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 123456 → "£1,234.56". */
export function formatPence(p: number): string {
  const n = Math.round(Number(p) || 0);
  return `${n < 0 ? '-' : ''}£${GBP.format(Math.abs(n) / 100)}`;
}

/** 8950 → "89.50", for a money input. Empty for none. */
export const penceToInput = (p: number | null | undefined) => (p == null ? '' : `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`);

/**
 * "£1,234.5", "89", " 0.99 " → pence. Empty → null (not priced yet). Pennies at most: a typed
 * "0.125" is refused rather than rounded, so nobody's price changes behind their back.
 */
export function parsePounds(input: string | number | null | undefined): { ok: true; pence: number | null } | { ok: false; error: string } {
  const s = String(input ?? '').replace(/[£,\s]/g, '');
  if (!s) return { ok: true, pence: null };
  const m = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(s) ?? /^()\.(\d{1,2})$/.exec(s);
  if (!m) return { ok: false, error: /^\d*\.\d{3,}$/.test(s) ? 'Pounds and pence only (two decimal places)' : 'That isn’t an amount' };
  return { ok: true, pence: Number(m[1] || 0) * 100 + Number((m[2] ?? '').padEnd(2, '0')) };
}

/** "12", "2.5" → a quantity (more than 0, up to MAX_QTY, 3 decimal places at most). */
export function parseQty(input: string | number | null | undefined): { ok: true; qty: number } | { ok: false; error: string } {
  const s = String(input ?? '').replace(/[,\s]/g, '');
  if (!s) return { ok: false, error: 'Quantity needed' };
  if (!/^(\d+(\.\d{0,3})?|\.\d{1,3})$/.test(s)) return { ok: false, error: 'Quantity: a number, up to 3 decimal places' };
  const qty = Number(s);
  if (!(qty > 0)) return { ok: false, error: 'Quantity must be more than 0' };
  if (qty > MAX_QTY) return { ok: false, error: `Quantity: ${MAX_QTY.toLocaleString('en-GB')} at most` };
  return { ok: true, qty };
}

/** 12 → "12", 2.5 → "2.5", 0.125 → "0.125". */
export const formatQty = (q: number) => String(Math.round(Number(q) * 1000) / 1000);

/* ── Lines, as the API takes them ────────────────────────────────────────────── */

export type CleanLine = {
  description: string;
  part_number: string | null;
  qty: number;
  unit_cost_pence: number | null;
  vat_rate: VatRate;
  received_qty: number | null;
};

const textOf = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const wholePence = (v: unknown, max: number): number | null | undefined => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
};

/**
 * Lines from a request (unit cost already in pence), checked and tidied, in order. The first problem
 * comes back in words with its line number ("Line 3: quantity needed"). Empty lines (no description,
 * quantity or price) are dropped.
 */
export function cleanLines(input: unknown): { ok: true; lines: CleanLine[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'No lines sent' };
  const raw = input.filter((l) => {
    const r = (l ?? {}) as Record<string, unknown>;
    return textOf(r.description, 1) || String(r.qty ?? '').trim() || (r.unit_cost_pence !== null && r.unit_cost_pence !== undefined && r.unit_cost_pence !== '');
  });
  if (raw.length > MAX_LINES) return { ok: false, error: `${MAX_LINES} lines at most on one order` };
  const out: CleanLine[] = [];
  for (const [i, l] of raw.entries()) {
    const r = (l ?? {}) as Record<string, unknown>;
    const at = `Line ${i + 1}`;
    const description = textOf(r.description, MAX_DESCRIPTION);
    if (!description) return { ok: false, error: `${at}: say what it is` };
    const q = parseQty(r.qty as string | number);
    if (!q.ok) return { ok: false, error: `${at}: ${q.error.charAt(0).toLowerCase()}${q.error.slice(1)}` };
    const unit = wholePence(r.unit_cost_pence, MAX_UNIT_PENCE);
    if (unit === undefined) return { ok: false, error: `${at}: the unit cost isn’t a price we can use (up to ${formatPence(MAX_UNIT_PENCE)})` };
    const rate = Number(r.vat_rate ?? 20);
    if (!isVatRate(rate)) return { ok: false, error: `${at}: VAT is 20%, 5% or 0%` };
    let received: number | null = null;
    if (r.received_qty !== null && r.received_qty !== undefined && r.received_qty !== '') {
      const n = Number(r.received_qty);
      if (!Number.isFinite(n) || n < 0 || n > MAX_QTY) return { ok: false, error: `${at}: the quantity received isn’t right` };
      received = Math.round(n * 1000) / 1000;
    }
    out.push({ description, part_number: textOf(r.part_number, MAX_PART_NUMBER) || null, qty: q.qty, unit_cost_pence: unit, vat_rate: rate, received_qty: received });
  }
  return { ok: true, lines: out };
}

/* ── Statuses and what can change in each ────────────────────────────────────── */

export const PO_STATUSES = ['draft', 'sent', 'confirmed', 'delivered', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const isPoStatus = (s: unknown): s is PoStatus => PO_STATUSES.includes(s as PoStatus);
export const STATUS_LABEL: Record<PoStatus, string> = { draft: 'Draft', sent: 'Sent', confirmed: 'Confirmed', delivered: 'Delivered', cancelled: 'Cancelled' };
/** Ordered and not delivered yet. */
export const OPEN_STATUSES: PoStatus[] = ['sent', 'confirmed'];
export const isOpen = (s: string) => (OPEN_STATUSES as string[]).includes(s);
/** Gone to the supplier at some point (counts as kit ordered; keeps a customer from being deleted). */
export const isOrdered = (s: string) => s === 'sent' || s === 'confirmed' || s === 'delivered';

/** What's printed on the PO: changing any of these once it's gone means sending it again. */
export const SUPPLIER_FIELDS = ['supplier_id', 'deliver_to', 'deliver_address', 'deliver_postcode', 'required_by', 'notes', 'lines'] as const;
export type Editable = {
  /** Who it's from (only before it goes: a different supplier is a new order). */
  supplier: boolean;
  /** Delivery, date, notes to the supplier and the lines. */
  order: boolean;
  /** Their invoice reference, total and when it was paid. */
  invoice: boolean;
  /** The note for us. Always. */
  internal: boolean;
  /** How many of each line arrived. */
  received: boolean;
};

export function editable(status: string): Editable {
  switch (status) {
    case 'draft':
      return { supplier: true, order: true, invoice: false, internal: true, received: false };
    case 'sent':
    case 'confirmed':
      return { supplier: false, order: true, invoice: true, internal: true, received: false };
    case 'delivered':
      return { supplier: false, order: false, invoice: true, internal: true, received: true };
    default:
      return { supplier: false, order: false, invoice: false, internal: true, received: false };
  }
}

/** Which of these changes can be saved in this status, or what's stopping them. */
export function checkChange(status: string, keys: string[]): string | null {
  const e = editable(status);
  const word = STATUS_LABEL[status as PoStatus]?.toLowerCase() ?? status;
  for (const k of keys) {
    if (k === 'supplier_id' && !e.supplier) return `The supplier can’t change once the order has gone to them. Cancel it and make a new one instead.`;
    if ((SUPPLIER_FIELDS as readonly string[]).includes(k) && k !== 'supplier_id' && !e.order) return `A ${word} order can’t be changed.`;
    if ((k === 'supplier_invoice_ref' || k === 'supplier_invoice_pence' || k === 'paid_on') && !e.invoice) {
      return status === 'draft' ? 'Add their invoice once the order has gone to them.' : `A ${word} order has no invoice to record.`;
    }
    if (k === 'received' && !e.received) return 'Quantities received are recorded when it’s marked as delivered.';
  }
  return null;
}

/** An order that's gone to the supplier and is then changed on paper needs sending again. */
export const marksChanged = (status: string, keys: string[]) => isOpen(status) && keys.some((k) => (SUPPLIER_FIELDS as readonly string[]).includes(k));

export type PoAction = 'send' | 'mark_sent' | 'confirm' | 'deliver' | 'undeliver' | 'cancel' | 'delete';
const ACTIONS: Record<PoStatus, PoAction[]> = {
  draft: ['send', 'mark_sent', 'delete'],
  sent: ['send', 'mark_sent', 'confirm', 'deliver', 'cancel'],
  confirmed: ['send', 'mark_sent', 'deliver', 'cancel'],
  delivered: ['undeliver'],
  cancelled: [],
};
export const actionsFor = (status: string): PoAction[] => ACTIONS[status as PoStatus] ?? [];
export const canDo = (status: string, a: PoAction) => actionsFor(status).includes(a);

/**
 * The status after sending (emailing it, or "Mark as sent"): a draft becomes Sent. Sent again after
 * a change, a confirmed order needs confirming again, so it goes back to Sent; sent again unchanged
 * (they lost the email), it stays Confirmed.
 */
export function afterSend(status: string, changedSinceSent: boolean): PoStatus {
  return status === 'confirmed' && !changedSinceSent ? 'confirmed' : 'sent';
}

/** Undo "delivered": back to Confirmed if the supplier had confirmed it, else Sent. */
export const afterUndeliver = (confirmedAt: string | null | undefined): PoStatus => (confirmedAt ? 'confirmed' : 'sent');

/** Why it can't go to the supplier yet, or null. */
export function sendBlocker(o: { status: string; lines: MoneyLine[] }): string | null {
  if (!canDo(o.status, 'send')) return `A ${STATUS_LABEL[o.status as PoStatus]?.toLowerCase() ?? o.status} order can’t be sent.`;
  if (!o.lines.length) return 'Add what you’re ordering first.';
  const unpriced = o.lines.filter((l) => l.unit_cost_pence == null).length;
  if (unpriced) return `${unpriced === 1 ? 'One line has' : `${unpriced} lines have`} no unit cost yet. Fill in the price from the supplier’s quote (0 if it’s free).`;
  return null;
}

/* ── Dates ───────────────────────────────────────────────────────────────────── */

/** A real date written YYYY-MM-DD, between 2020 and 2100. */
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2020 && y <= 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Open, with a required-by date before today (UK date, YYYY-MM-DD). */
export const isLate = (o: { status: string; required_by: string | null }, today: string) => isOpen(o.status) && !!o.required_by && o.required_by < today;
