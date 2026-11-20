import type { JobHead } from '../handover/inputs';
import { TERMS_FACTS, TERMS_VERSION } from './terms';
import type { Fix } from './slots';

/**
 * What the proposal pack's own documents are made from (HX-PP-01 covering letter, HX-PP-04 contract
 * of sale, HX-PP-08 complaints procedure), from facts the server loads (generate.ts). Each builder
 * returns its input or what it still needs. Pure, so scripts/test-proposal-docs.mjs reads the same rules.
 */

export type ProposalFacts = {
  today: string;
  ref: string | null;
  customer: { name: string; first: string };
  address: string[];
  postcode: string | null;
  products: string[];
  owner: string | null;
  /** The newest quotation sent (or accepted), else the newest one. Null: none made yet. */
  quote: {
    number: string | null;
    title: string | null;
    /** YYYY-MM-DD the quotation was sent (or made). */
    on: string;
    validUntil: string | null;
    net: number;
    vat: number;
    gross: number;
    byRate: { rate: number; net: number; vat: number }[];
    depositPence: number | null;
    /** The quote carries the design software's MCS performance estimate. */
    hasEstimate: boolean;
  } | null;
  /** YYYY-MM-DD the install is booked for, if it is. */
  installOn: string | null;
  /** The customer signed (portal or outside it): the contract is never made again. */
  signed: boolean;
  warrantyYears: number | null;
  /** The items in the proposal pack, in order, for the covering letter's list. */
  contents: string[];
};

export type Made<T> = { ok: true; input: T } | { ok: false; why: string; fix: Fix };

const head = (f: ProposalFacts): JobHead => ({ ref: f.ref, issued: f.today, customer: f.customer.name, address: f.address, postcode: f.postcode });
const TECH_WORDS: Record<string, string> = { solar: 'solar panels', battery: 'a battery', heatpump: 'a heat pump', ev: 'an EV charger' };

/** "solar panels and a battery". */
export function techWords(products: string[]): string {
  const w = products.map((p) => TECH_WORDS[p]).filter(Boolean);
  if (!w.length) return 'a renewable energy system';
  return w.length === 1 ? w[0] : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

/** 2026-11-20 + n days. */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "20 November 2026". */
export function longYmd(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const validUntil = (f: ProposalFacts) => f.quote?.validUntil ?? addDaysYmd(f.quote?.on ?? f.today, TERMS_FACTS.quoteValidDays);

/* ── HX-PP-01: the covering letter ───────────────────────────────────────── */

export type ProposalCoverInput = JobHead & { first: string; what: string; contents: string[]; validUntil: string; owner: string | null; quoteNumber: string | null; terms: string };
export function coverInput(f: ProposalFacts): Made<ProposalCoverInput> {
  if (!f.customer.name) return { ok: false, why: 'Add the customer’s name.', fix: 'job' };
  return {
    ok: true,
    input: { ...head(f), first: f.customer.first, what: techWords(f.products), contents: f.contents, validUntil: validUntil(f), owner: f.owner, quoteNumber: f.quote?.number ?? null, terms: TERMS_VERSION },
  };
}

/* ── HX-PP-04: the contract of sale, with its cancellation form ────────────── */

export type ContractInput = JobHead & {
  what: string;
  solar: boolean;
  quote: { number: string | null; on: string; net: number; vat: number; gross: number; byRate: { rate: number; net: number; vat: number }[] };
  validUntil: string;
  schedule: { what: string; pence: number; due: string }[];
  installOn: string | null;
  owner: string | null;
  warrantyYears: number | null;
  terms: string;
};
export function contractInput(f: ProposalFacts): Made<ContractInput> {
  if (!f.customer.name) return { ok: false, why: 'Add the customer’s name.', fix: 'job' };
  if (!f.address.length) return { ok: false, why: 'Add the installation address on Job details: the contract names it.', fix: 'job' };
  const q = f.quote;
  if (!q || q.gross <= 0) return { ok: false, why: 'Make the quotation first: the contract sets out its price and payments.', fix: 'opensolar' };
  // RECC: a deposit is never more than 25% of the price.
  const deposit = q.depositPence && q.depositPence > 0 ? Math.min(q.depositPence, Math.floor(q.gross * 0.25)) : 0;
  const schedule = [
    ...(deposit ? [{ what: 'Deposit', pence: deposit, due: 'When you sign this contract' }] : []),
    { what: deposit ? 'Balance' : 'Full price', pence: q.gross - deposit, due: 'When the installation is finished' },
  ];
  return {
    ok: true,
    input: {
      ...head(f),
      what: techWords(f.products),
      solar: f.products.includes('solar'),
      quote: { number: q.number, on: q.on, net: q.net, vat: q.vat, gross: q.gross, byRate: q.byRate },
      validUntil: validUntil(f),
      schedule,
      installOn: f.installOn,
      owner: f.owner,
      warrantyYears: f.warrantyYears,
      terms: TERMS_VERSION,
    },
  };
}

/* ── HX-PP-08: the complaints procedure ──────────────────────────────────── */

export type ComplaintsInput = JobHead & { contact: string; terms: string };
export function complaintsInput(f: ProposalFacts): Made<ComplaintsInput> {
  return { ok: true, input: { ...head(f), contact: f.owner ? `${f.owner} at Heliaxis` : 'the Heliaxis office', terms: TERMS_VERSION } };
}
