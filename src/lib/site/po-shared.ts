/**
 * A labour PO as it was issued (purchase_orders.labour): everything printed on it, frozen, so the
 * PDF, the Orders sheet and the trade's phone all say the same thing whatever changes later. Types
 * and words only: safe in the browser.
 */
import type { RateBasis, VatTreatment } from './money';
import type { Stage, Trade } from './types';

/** Why a PO waits for the office (status draft) instead of going straight out. */
export type HeldReason = 'rate' | 'qty' | 'vat' | 'contact' | 'urgent' | 'scaffold';
export const HELD_WORDS: Record<HeldReason, string> = {
  rate: 'Add the agreed rate to issue the PO',
  qty: 'No quantity to charge yet: add it on the Site tab',
  vat: 'Choose the VAT for this PO on the Site tab',
  contact: 'No email or WhatsApp for them: add one to send the PO',
  urgent: 'An Urgent problem is flagged, and your setting holds the PO for it',
  scaffold: 'The scaffold isn’t down yet, and your setting holds the PO until it is',
};
/** Holds the office can issue past (its own settings); the others need the missing detail first. */
export const OVERRIDABLE: HeldReason[] = ['urgent', 'scaffold'];

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
  payment_terms: string | null;
  signed: { by: string; at: string; stage: Stage } | null;
  quote_line: string;
  held: HeldReason[];
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
