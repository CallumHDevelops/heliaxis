/**
 * The electrician's part of the job pack (pack.ts adds it for electricians): the facts their forms
 * read (FormCtx.el: the roofer's synced answers and reads, the DNO route, the design's extras, what
 * this person used last time), the roofer's evidence photos for F44, the certificate files already
 * uploaded, and the customer's signatures taken after the sign-off. Types and pure helpers only:
 * safe in the browser, on the server and in the tests.
 */
import type { ElectricianFacts } from './forms/types';
import type { Answers } from './types';

/** A file the trade uploaded (their own certificate), as the server holds it. */
export type TradeFile = { id: string; slot: string; name: string; mime: string; client_id: string | null; url: string | null };
/** A customer's signature taken on the electrician's phone after the sign-off (P15), per document. */
export type CustomerSignKind = 'f16e' | 'g98';
export type CustomerSigned = { name: string; signed_at: string };

export type ElectricianPack = {
  facts: Omit<ElectricianFacts, 'cert_route'>;
  /** The roofer's photos shown as evidence beside F44 rows (fixings, the cable entry). */
  roofer_photos: { id: string; slot: string; thumb: string | null }[];
  uploads: TradeFile[];
  /** Customer signatures the server has, by document. */
  customer: Partial<Record<CustomerSignKind, CustomerSigned>>;
  /** The job goes to the DNO by G98, so Form B wants the customer's own signature too. */
  g98: boolean;
};

/** The form context's facts from the pack (on the phone): the pack's, with the assignment's certificate route. */
export function factsFromPack(pack: { electrician?: ElectricianPack | null; assignment: { cert_route: string } }): ElectricianFacts | undefined {
  return pack.electrician ? { ...pack.electrician.facts, cert_route: pack.assignment.cert_route } : undefined;
}

/** Photo counts plus certificate files (a PHOTOS field with `files` counts both), by slot. */
export function withFiles(photos: Record<string, number>, files: { slot: string }[]): Record<string, number> {
  const out = { ...photos };
  for (const f of files) out[f.slot] = (out[f.slot] ?? 0) + 1;
  return out;
}

/** What the roofer has given that the electrician's forms read (FORMS 1.6), and nothing else. */
export const ROOFER_KEYS = ['RF7', 'RF7a', 'RF10', 'RF11', 'RF13', 'RF14', 'RX1', 'RX2', 'RX4', 'RX5'];
/** The roofer's photo slots shown beside F44 rows. */
export const ROOFER_EVIDENCE = ['RF2', 'RX4p'];

export function rooferValues(a: Answers | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ROOFER_KEYS) {
    const x = a?.[k];
    if (x && typeof x === 'object' && 'v' in x) out[k] = x.v;
  }
  return out;
}

/**
 * What the customer reads above each signature (P15), one per document (D15: a signature is never
 * reused). The completion line is a plain draft for the owner's approval (F16E is his to word); the
 * G98 one only says what the signature is for, as Form B's own wording isn't copied in yet (D14).
 */
export const CUSTOMER_DECLARATION: Record<CustomerSignKind, (address: string) => string> = {
  f16e: (address) => `I’m happy that the work at ${address || 'my home'} has been finished, and I’ve been shown how the system works and how to switch it off.`,
  g98: () => 'Your signature for the G98 Form B, which tells the electricity network (DNO) about your system.',
};
export const CUSTOMER_SIGN_TITLE: Record<CustomerSignKind, string> = { f16e: 'Completion of works', g98: 'G98 notice to the DNO' };
