/**
 * A labour PO as it was issued (purchase_orders.labour): everything printed on it, frozen, so the
 * PDF, the Orders sheet and the trade's phone all say the same thing whatever changes later. Types
 * and words only: safe in the browser.
 */
import type { RateBasis, VatTreatment } from './money';
import type { Stage, Trade } from './types';

/** Why a PO waits for the office (status draft) instead of going straight out. */
export type HeldReason = 'rate' | 'qty' | 'vat' | 'contact' | 'urgent' | 'scaffold' | 'panels';
export const HELD_WORDS: Record<HeldReason, string> = {
  rate: 'Add the agreed rate to issue the PO',
  qty: 'No quantity to charge yet: add it on the Site tab',
  vat: 'Choose the VAT for this PO on the Site tab',
  contact: 'No email or WhatsApp for them: add one to send the PO',
  urgent: 'An Urgent problem is flagged, and your setting holds the PO for it',
  scaffold: 'The scaffold isn’t down yet, and your setting holds the PO until it is',
  panels: 'The roofer’s panel count doesn’t match the design: check it before issuing',
};
/**
 * Holds the office can issue past (its own settings, and a panel count it has checked); the others
 * need the missing detail first.
 */
export const OVERRIDABLE: HeldReason[] = ['urgent', 'scaffold', 'panels'];

/** What each hold says for this PO: its own words where it has them (the panel count names both numbers). */
export const heldWords = (s: { held: HeldReason[]; held_notes?: Partial<Record<HeldReason, string>> | null } | null | undefined): string[] =>
  (s?.held ?? []).map((h) => s?.held_notes?.[h] || HELD_WORDS[h]);

const count = (n: number) => `${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 }).format(n)} panel${n === 1 ? '' : 's'}`;
/**
 * A per-panel PO pays the panels the roofer signed for, so a count the design (or, with no count in
 * the design, the strings they signed) doesn't back up waits for the office, naming both numbers.
 * Not a whole number, or more than the form allows (200), is held too. Null: nothing to check.
 */
export function panelsHold(signed: number, design: number | null | undefined, strings: number | null | undefined): string | null {
  const odd = !Number.isInteger(signed) || signed > 200;
  if (design && signed !== design) return `The roofer signed for ${count(signed)} but the design has ${count(design)}: check the count before issuing`;
  if (!design && strings && signed !== strings) return `The roofer signed for ${count(signed)} but their strings add up to ${count(strings)}: check the count before issuing`;
  if (odd) return `The roofer signed for ${count(signed)}: check the count before issuing`;
  return null;
}

/**
 * The terms on every labour PO (the owner's final wording, 21 Oct), one constant for the PO's PDF,
 * the trade's phone and the PO email. {address} and {po} are filled per PO (poTerms); the filled
 * list is frozen in the snapshot when it's issued.
 */
export const PO_TERMS: readonly string[] = [
  'This purchase order was raised automatically after you declared that the work at {address} is complete and correct and that your answers, photos and readings are true.',
  'Heliaxis will review your photos and results. If anything needs putting right, we will tell you in writing and you will need to return to site to fix it at your own cost (clause 12.3). We may hold or dispute payment on this purchase order until it is put right (clauses 4.7 and 12.4).',
  'It is issued under your Subcontractor Agreement with Heliaxis Limited and does not change or override any of its terms. If anything here differs from the Agreement, the Agreement applies.',
  'Please quote {po} on your invoice and include the supporting documents the Agreement asks for (clause 4.2).',
  'Heliaxis may dispute or reject all or part of an invoice by telling you in writing within 7 working days of receiving it (clause 4.7). Undisputed invoices are paid within 14 days of the accepted invoice date (clause 4.3).',
  'CIS is deducted from the labour element only, at the rate shown (clause 5).',
];
export const PO_TERMS_TITLE = 'Terms';

/** The terms for one PO, numbered as printed ("1. This purchase order was raised…"). */
export const poTerms = (address: string, poNumber: string): string[] =>
  PO_TERMS.map((t, i) => `${i + 1}. ${t.replace('{address}', address.trim() || 'the site').replace('{po}', poNumber || 'the PO number')}`);

export type LabourSnapshot = {
  po_number: string;
  /** The day it was issued (YYYY-MM-DD, UK); null while it's held. */
  issued: string | null;
  /** 1 for the first issue, 2 after Issue again… */
  version: number;
  job: { ref: string | null; address: string };
  sub: { company: string | null; contact: string; mobile: string | null; email: string | null; firm_ref: string | null };
  trade: Trade;
  trade_title: string;
  scope: string | null;
  rate_pence: number | null;
  basis: RateBasis | null;
  qty: number | null;
  /** "16 panels (as signed by the roofer)", "1 job (fixed price)", "2 days (as agreed)". */
  qty_words: string | null;
  /** "£30.00 per panel × 16 panels (as signed by the roofer)". */
  rate_words: string | null;
  lines: { description: string; qty: number; unit_pence: number; net: number; cis: boolean }[];
  labour_net: number;
  materials_net: number;
  net: number;
  vat_treatment: VatTreatment | null;
  vat_words: string;
  vat: number;
  cis: { words: string; percent: number; pence: number };
  payable: number;
  /** Before the owner's terms: his payment terms sentence from Site settings (older snapshots only). */
  payment_terms: string | null;
  /** The PO's terms as issued, numbered (poTerms). Missing on snapshots from before them. */
  terms?: string[];
  signed: { by: string; at: string; stage: Stage } | null;
  quote_line: string;
  held: HeldReason[];
  /** A hold's own words for this PO ("The roofer signed for 61 panels but the design has 16…"). */
  held_notes?: Partial<Record<HeldReason, string>>;
  /** Issued again after a change: the day the version it replaces went. */
  replaces: string | null;
};

const asNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
/** A stored snapshot, read back defensively (older rows, hand edits). */
export function snapshotOf(v: unknown): LabourSnapshot | null {
  if (!v || typeof v !== 'object' || !('po_number' in v)) return null;
  const s = v as LabourSnapshot;
  return { ...s, net: asNum(s.net), vat: asNum(s.vat), payable: asNum(s.payable), held: Array.isArray(s.held) ? s.held : [] };
}

export type PoNext = 'sending' | 'held' | 'sent' | 'none';
/**
 * What happens to a labour PO next, as the trade sees it (the done screen, P11): on its way now,
 * waiting for the office ("once the office has checked one thing"), gone already, or no PO. At the
 * strike the scaffold hold is lifted, so it goes then unless something else holds it.
 */
export function poNext(po: { status: string; changed_since_sent?: boolean; labour: unknown } | null, stage: Stage): PoNext {
  if (!po || po.status === 'cancelled') return 'none';
  if (po.status !== 'draft') return po.changed_since_sent ? 'held' : 'sent';
  const snap = snapshotOf(po.labour);
  if ((snap?.version ?? 0) > 0) return 'sent';
  const held = (snap?.held ?? []).filter((h) => !(stage === 'strike' && h === 'scaffold'));
  return held.length ? 'held' : 'sending';
}
