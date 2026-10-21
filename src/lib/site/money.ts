/**
 * Labour purchase orders: the money, all in whole pence. Pure (no imports), so the Site tab's
 * preview, the sign-off route, the PO PDF and scripts/test-site-money.mjs all work it out the same way.
 *
 *   labourNet    = Σ lines that count for CIS (rate × qty, rounded half-up per line)
 *   materialsNet = Σ lines that don't (labour POs from a sign-off have none; the office can add one)
 *   vat          = standard: half-up(net × 20%) · reverse charge, zero-rated, not registered: 0
 *   cis          = CIS_ROUND(labourNet × CIS % ÷ 100), on labour only: never VAT or materials
 *   payable      = labourNet + materialsNet + vat − cis
 *
 * CIS %: a rate changed for this job, else the firm's verified rate (gross 0%, net 20%, higher 30%),
 * else 30% (not verified with HMRC). VAT: a firm with no VAT number can't charge it.
 */

export type VatTreatment = 'none' | 'reverse_charge' | 'standard' | 'zero';
export const VAT_TREATMENTS: VatTreatment[] = ['none', 'reverse_charge', 'standard', 'zero'];
export const isVatTreatment = (v: unknown): v is VatTreatment => VAT_TREATMENTS.includes(v as VatTreatment);
/** As printed on the PO and shown on the Site tab. */
export const VAT_WORDS: Record<VatTreatment, string> = {
  none: 'Not VAT registered: no VAT',
  reverse_charge: 'Reverse charge: customer to pay the VAT to HMRC',
  standard: 'VAT 20%',
  zero: 'Zero-rated',
};
/** Short, for the preview line: "no VAT", "+ VAT £96.00". */
export const VAT_SHORT: Record<VatTreatment, string> = { none: 'no VAT', reverse_charge: 'reverse charge', standard: 'VAT 20%', zero: 'zero-rated' };
export const STANDARD_VAT = 20;

export type CisRate = 'gross' | 'net' | 'higher';
export const CIS_RATES: CisRate[] = ['gross', 'net', 'higher'];
export const isCisRate = (v: unknown): v is CisRate => CIS_RATES.includes(v as CisRate);
export const CIS_PERCENT: Record<CisRate, number> = { gross: 0, net: 20, higher: 30 };
/** Deducted when nobody has verified the subcontractor with HMRC. */
export const UNVERIFIED_CIS = 30;

/**
 * The one rounding rule for the CIS deduction. Down to the penny until the accountant says
 * otherwise (owner question 7): the subcontractor is never short-changed by rounding.
 */
export const CIS_ROUND = (pence: number) => Math.floor(pence);

export type RateBasis = 'fixed' | 'per_panel' | 'per_day' | 'per_hour';
export const RATE_BASES: RateBasis[] = ['fixed', 'per_panel', 'per_day', 'per_hour'];
export const isRateBasis = (v: unknown): v is RateBasis => RATE_BASES.includes(v as RateBasis);
export const BASIS_LABEL: Record<RateBasis, string> = { fixed: 'Fixed price', per_panel: 'Per panel', per_day: 'Per day', per_hour: 'Per hour' };
const UNIT: Record<RateBasis, [string, string]> = { fixed: ['job', 'jobs'], per_panel: ['panel', 'panels'], per_day: ['day', 'days'], per_hour: ['hour', 'hours'] };
/** "16 panels", "1 day", "2.5 hours". */
export const qtyWords = (basis: RateBasis, qty: number) => `${formatQty(qty)} ${UNIT[basis][qty === 1 ? 0 : 1]}`;

/* ── CIS ─────────────────────────────────────────────────────────────────────── */

/** What decides the deduction: is the firm (or quick contact) verified with HMRC, at which rate, and any change for this job. */
export type CisInput = { verifiedOn: string | null | undefined; rate: CisRate | null | undefined; override?: CisRate | null };

/** Verified means a date and a rate: a verification without its rate counts as not verified. */
export const cisVerified = (c: CisInput) => !!c.verifiedOn && isCisRate(c.rate);

export function cisPercent(c: CisInput): number {
  if (c.override && isCisRate(c.override)) return CIS_PERCENT[c.override];
  return cisVerified(c) ? CIS_PERCENT[c.rate as CisRate] : UNVERIFIED_CIS;
}

/** "CIS: verified (net) · 20% deducted", "Not verified · 30% deducted", "Gross status · no deduction". */
export function cisWords(c: CisInput): string {
  const pct = cisPercent(c);
  const base = c.override
    ? c.override === 'gross'
      ? 'Gross status (changed for this job)'
      : `${c.override === 'net' ? 'Net' : 'Higher'} rate (changed for this job)`
    : !cisVerified(c)
      ? 'Not verified'
      : c.rate === 'gross'
        ? 'Gross status'
        : c.rate === 'net'
          ? 'CIS: verified (net)'
          : 'CIS: verified (higher rate)';
  return `${base} · ${pct === 0 ? 'no deduction' : `${pct}% deducted`}`;
}

/* ── Lines and totals ────────────────────────────────────────────────────────── */

/** a ÷ b rounded half-up, for whole numbers a ≥ 0 and b > 0 (exact: no floating point). */
const divHalfUp = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));
const thousandths = (qty: number) => Math.round(qty * 1000);

/** One line's net in pence: qty × unit rate, half-up (as purchase-orders/money.ts lineNet). */
export function lineNet(qty: number, unitPence: number): number {
  if (!(qty > 0) || !(unitPence >= 0)) return 0;
  return divHalfUp(thousandths(qty) * unitPence, 1000);
}

/** A labour PO line: `cis` false for materials (no CIS deduction on them). */
export type LabourLine = { description: string; qty: number; unit_pence: number; cis: boolean };

export type LabourMoney = {
  lines: number[];
  labourNet: number;
  materialsNet: number;
  net: number;
  vat: number;
  cisPercent: number;
  cis: number;
  payable: number;
};

export function labourMoney(lines: LabourLine[], vat: VatTreatment, cisPct: number): LabourMoney {
  const nets = lines.map((l) => lineNet(l.qty, l.unit_pence));
  const labourNet = nets.reduce((n, x, i) => n + (lines[i].cis ? x : 0), 0);
  const materialsNet = nets.reduce((n, x, i) => n + (lines[i].cis ? 0 : x), 0);
  const net = labourNet + materialsNet;
  const vatPence = vat === 'standard' ? divHalfUp(net * STANDARD_VAT, 100) : 0;
  const cis = CIS_ROUND((labourNet * cisPct) / 100);
  return { lines: nets, labourNet, materialsNet, net, vat: vatPence, cisPercent: cisPct, cis, payable: net + vatPence - cis };
}

/* ── Money in words ──────────────────────────────────────────────────────────── */

const GBP = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 38400 → "£384.00". */
export function formatPence(p: number): string {
  const n = Math.round(Number(p) || 0);
  return `${n < 0 ? '-' : ''}£${GBP.format(Math.abs(n) / 100)}`;
}
/** 12 → "12", 2.5 → "2.5". */
export const formatQty = (q: number) => String(Math.round(Number(q) * 1000) / 1000);

/** "£30.00 per panel", "£450.00 fixed". */
export function rateWords(pence: number, basis: RateBasis): string {
  return basis === 'fixed' ? `${formatPence(pence)} fixed` : `${formatPence(pence)} per ${UNIT[basis][0]}`;
}

/** The Site tab's preview once every figure is known: "£480.00 · no VAT · CIS −£96.00 · pays £384.00". */
export function previewWords(m: LabourMoney, vat: VatTreatment): string {
  return [
    formatPence(m.net),
    vat === 'standard' ? `VAT ${formatPence(m.vat)}` : VAT_SHORT[vat],
    m.cis ? `CIS −${formatPence(m.cis)}` : 'no CIS',
    `pays ${formatPence(m.payable)}`,
  ].join(' · ');
}

/* ── Agreed rates from a subcontractor's agreement ───────────────────────────── */

/**
 * A rate from the firm's agreement ("£30.00 per panel"), only when it can't mean anything else.
 * "£30–35", "tbc", "day rate" or "To be agreed" give null: the office types the rate.
 */
export function parseAgreedRate(text: unknown): { pence: number; basis: RateBasis } | null {
  const s = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const m = /^£\s?(\d{1,6})(?:\.(\d{2}))?\s?(?:per|a|an|\/)\s?(panel|hour|hr|day)$/.exec(s);
  if (m) {
    const basis: RateBasis = m[3] === 'panel' ? 'per_panel' : m[3] === 'day' ? 'per_day' : 'per_hour';
    return { pence: Number(m[1]) * 100 + Number(m[2] ?? 0), basis };
  }
  const f = /^£\s?(\d{1,6})(?:\.(\d{2}))?\s?(?:fixed|per job|a job|for the job)$/.exec(s);
  if (f) return { pence: Number(f[1]) * 100 + Number(f[2] ?? 0), basis: 'fixed' };
  return null;
}

/** "£30" / "30.00" / "£1,250.5" → pence; null for empty; undefined when it isn't an amount. */
export function poundsToPence(input: unknown): number | null | undefined {
  const s = String(input ?? '').replace(/[£,\s]/g, '');
  if (!s) return null;
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
/** 3000 → "30.00" for a money box. */
export const penceToInput = (p: number | null | undefined) => (p == null ? '' : `${Math.floor(p / 100)}.${String(p % 100).padStart(2, '0')}`);
