/**
 * Putting a trade on a job: the checks on what the office types (rate and basis, VAT, the person's
 * mobile) shared by the Site tab, New project and the API. Pure, so scripts/test-site-money.mjs
 * checks the VAT and CIS rules directly.
 */
import { cisPercent, cisWords, isCisRate, isRateBasis, isVatTreatment, labourMoney, previewWords, rateWords, VAT_WORDS, type CisRate, type RateBasis, type VatTreatment } from './money';
import { isTrade, type CertRoute, type Trade } from './types';

/* ── The person ──────────────────────────────────────────────────────────────── */

/** A phone number as WhatsApp ids it (country code and number, digits only), as whatsapp/shared.ts toWaId. */
export function waIdOf(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.trim().replace(/^\+/, '00').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `44${d.slice(1)}`;
  if (d.startsWith('440')) d = `44${d.slice(3)}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** What's wrong with a number typed as a mobile, in plain words, or null. Numbers abroad are taken as they are. */
export function mobileProblem(mobile: string | null | undefined): string | null {
  const s = String(mobile ?? '').trim();
  if (!s) return null;
  const wa = waIdOf(s);
  if (!wa) return 'That isn’t a phone number we can use. Check the digits.';
  if (wa.startsWith('44') && !/^447\d{9}$/.test(wa)) return 'That looks like a landline. WhatsApp needs a mobile.';
  return null;
}

export const isEmail = (s: unknown): s is string => typeof s === 'string' && s.length <= 200 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);

/* ── VAT (D9) ────────────────────────────────────────────────────────────────── */

export type VatResult = { ok: true; value: VatTreatment } | { ok: false; error: string };

/**
 * The VAT line on their POs. Not VAT registered: no VAT, whatever was asked (and asking for VAT is an
 * error: they can't charge it). VAT registered: what was chosen, else the company's default, else
 * the office has to choose.
 */
export function vatFor(registered: boolean, requested: unknown, companyDefault: '' | Exclude<VatTreatment, 'none'>): VatResult {
  const asked = requested === undefined || requested === null || requested === '' ? null : requested;
  if (!registered) {
    if (asked && asked !== 'none') return { ok: false, error: 'Not VAT registered: no VAT. They can’t charge VAT without a VAT number.' };
    return { ok: true, value: 'none' };
  }
  if (asked) {
    if (!isVatTreatment(asked)) return { ok: false, error: 'Choose the VAT: reverse charge, 20% VAT or zero-rated.' };
    if (asked === 'none') return { ok: false, error: 'They’re VAT registered: choose reverse charge, 20% VAT or zero-rated.' };
    return { ok: true, value: asked };
  }
  if (companyDefault) return { ok: true, value: companyDefault };
  return { ok: false, error: 'They’re VAT registered. Choose the VAT for this job: reverse charge, 20% VAT or zero-rated.' };
}

/* ── The assignment as typed ─────────────────────────────────────────────────── */

export const CERT_ROUTES: CertRoute[] = ['eic', 'eic_single', 'meiwc', 'own'];
export const isCertRoute = (v: unknown): v is CertRoute => CERT_ROUTES.includes(v as CertRoute);

export type AssignmentFields = {
  trade: Trade;
  trade_label: string | null;
  scope: string | null;
  starts_on: string | null;
  days: number | null;
  rate_pence: number | null;
  rate_basis: RateBasis | null;
  rate_qty: number | null;
  raise_po: boolean;
  cis_override: CisRate | null;
  share_customer_phone: boolean;
  note_to_trade: string | null;
  cert_route: CertRoute;
};

const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/**
 * The fields of a new assignment, or the changed ones of an existing one (`partial`), checked.
 * Money comes in pence (rate_pence) with its basis; a per-day or per-hour rate needs how many.
 */
export function cleanAssignment(
  b: Record<string, unknown>,
  partial: false
): { ok: true; fields: AssignmentFields } | { ok: false; error: string };
export function cleanAssignment(
  b: Record<string, unknown>,
  partial: true,
  current: Pick<AssignmentFields, 'rate_basis' | 'rate_pence' | 'rate_qty'>
): { ok: true; fields: Partial<AssignmentFields> } | { ok: false; error: string };
export function cleanAssignment(
  b: Record<string, unknown>,
  partial: boolean,
  current?: Pick<AssignmentFields, 'rate_basis' | 'rate_pence' | 'rate_qty'>
): { ok: true; fields: Partial<AssignmentFields> } | { ok: false; error: string } {
  const out: Partial<AssignmentFields> = {};
  const given = (k: string) => !partial || k in b;
  if (given('trade')) {
    if (!isTrade(b.trade)) return { ok: false, error: 'Choose the trade.' };
    out.trade = b.trade;
  }
  if (given('trade_label')) out.trade_label = text(b.trade_label, 60);
  if (out.trade === 'other' && !out.trade_label && !partial) return { ok: false, error: 'Say what the trade is (e.g. Plasterer).' };
  if (given('scope')) out.scope = text(b.scope, 300);
  if (given('starts_on')) {
    if (b.starts_on && !isDay(b.starts_on)) return { ok: false, error: 'The start date isn’t a real date.' };
    out.starts_on = (b.starts_on as string) || null;
  }
  if (given('days')) {
    if (b.days === null || b.days === undefined || b.days === '') out.days = null;
    else {
      const n = Number(b.days);
      if (!Number.isFinite(n) || n <= 0 || n > 60 || Math.round(n * 10) !== n * 10) return { ok: false, error: 'Days on site: a number like 1 or 1.5.' };
      out.days = n;
    }
  }
  if (given('rate_pence')) {
    if (b.rate_pence === null || b.rate_pence === undefined || b.rate_pence === '') out.rate_pence = null;
    else {
      const n = Number(b.rate_pence);
      if (!Number.isInteger(n) || n < 0 || n > 10_000_000) return { ok: false, error: 'The rate isn’t an amount we can use.' };
      out.rate_pence = n;
    }
  }
  if (given('rate_basis')) {
    if (b.rate_basis === null || b.rate_basis === undefined || b.rate_basis === '') out.rate_basis = null;
    else if (!isRateBasis(b.rate_basis)) return { ok: false, error: 'Choose how the rate is paid: fixed, per panel, per day or per hour.' };
    else out.rate_basis = b.rate_basis;
  }
  if (given('rate_qty')) {
    if (b.rate_qty === null || b.rate_qty === undefined || b.rate_qty === '') out.rate_qty = null;
    else {
      const n = Number(b.rate_qty);
      if (!Number.isFinite(n) || n <= 0 || n > 1000 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return { ok: false, error: 'How many days or hours: a number, up to 2 decimal places.' };
      out.rate_qty = n;
    }
  }
  // The rate, its basis and the quantity hang together.
  const rate = 'rate_pence' in out ? out.rate_pence : current?.rate_pence ?? null;
  const basis = 'rate_basis' in out ? out.rate_basis : current?.rate_basis ?? null;
  const qty = 'rate_qty' in out ? out.rate_qty : current?.rate_qty ?? null;
  if (rate != null && !basis) return { ok: false, error: 'Choose how the rate is paid: fixed, per panel, per day or per hour.' };
  if (basis === 'fixed' || basis === 'per_panel') {
    if ('rate_qty' in out || (!partial && qty != null)) out.rate_qty = null;
  } else if (basis && rate != null && qty == null) return { ok: false, error: `How many ${basis === 'per_day' ? 'days' : 'hours'} were agreed?` };
  if (given('raise_po')) out.raise_po = b.raise_po !== false;
  if (given('cis_override')) {
    if (b.cis_override === null || b.cis_override === undefined || b.cis_override === '') out.cis_override = null;
    else if (!isCisRate(b.cis_override)) return { ok: false, error: 'CIS: gross, net or higher rate.' };
    else out.cis_override = b.cis_override;
  }
  if (given('share_customer_phone')) out.share_customer_phone = b.share_customer_phone !== false;
  if (given('note_to_trade')) out.note_to_trade = String(b.note_to_trade ?? '').trim().slice(0, 1000) || null;
  if (given('cert_route')) {
    if (b.cert_route === undefined || b.cert_route === null || b.cert_route === '') out.cert_route = 'eic';
    else if (!isCertRoute(b.cert_route)) return { ok: false, error: 'Unknown certificate route.' };
    else out.cert_route = b.cert_route;
  }
  return { ok: true, fields: out };
}

/* ── What the PO will say, before anyone signs ───────────────────────────────── */

export type MoneyLine = {
  /** "£30.00 per panel" or null when no rate is agreed. */
  rate: string | null;
  /** "16 panels, as signed by the roofer", "Panels from the roofer's sign-off". */
  qty: string | null;
  vat: string;
  cis: string;
  cisPercent: number;
  /** "£480.00 · no VAT · CIS −£96.00 · pays £384.00": only when every figure is known. */
  preview: string | null;
  /** Why there's no PO preview yet, or why it would be held. */
  missing: string | null;
};

/** The money for an assignment as the Site tab shows it. `panels`: the roofer's signed count, once known. */
export function moneyLine(a: {
  rate_pence: number | null;
  rate_basis: RateBasis | null;
  rate_qty: number | null;
  vat_treatment: VatTreatment | null;
  raise_po: boolean;
  cis: { verifiedOn: string | null | undefined; rate: CisRate | null | undefined; override?: CisRate | null };
  panels?: number | null;
}): MoneyLine {
  const pct = cisPercent(a.cis);
  const vat = a.vat_treatment ? VAT_WORDS[a.vat_treatment] : 'VAT not chosen yet';
  const cis = cisWords(a.cis);
  if (!a.raise_po) return { rate: null, qty: null, vat, cis, cisPercent: pct, preview: null, missing: 'No PO: Heliaxis staff' };
  if (a.rate_pence == null || !a.rate_basis) return { rate: null, qty: null, vat, cis, cisPercent: pct, preview: null, missing: 'Add the agreed rate to issue the PO' };
  const rate = rateWords(a.rate_pence, a.rate_basis);
  const qty = a.rate_basis === 'fixed' ? 1 : a.rate_basis === 'per_panel' ? (a.panels ?? null) : a.rate_qty;
  const qtyText =
    a.rate_basis === 'fixed'
      ? null
      : a.rate_basis === 'per_panel'
        ? qty == null
          ? 'Panels from the roofer’s sign-off'
          : `${qty} panel${qty === 1 ? '' : 's'}, as signed by the roofer`
        : qty == null
          ? null
          : `${qty} ${a.rate_basis === 'per_day' ? 'day' : 'hour'}${qty === 1 ? '' : 's'} agreed`;
  if (!a.vat_treatment) return { rate, qty: qtyText, vat, cis, cisPercent: pct, preview: null, missing: 'Choose the VAT for this job' };
  if (qty == null) return { rate, qty: qtyText, vat, cis, cisPercent: pct, preview: null, missing: null };
  const m = labourMoney([{ description: '', qty, unit_pence: a.rate_pence, cis: true }], a.vat_treatment, pct);
  return { rate, qty: qtyText, vat, cis, cisPercent: pct, preview: previewWords(m, a.vat_treatment), missing: null };
}

