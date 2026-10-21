/**
 * What a trade signs (the owner's wording, 21 Oct), one per trade with its own work words, and the
 * same for a Put right with "the work to put right … at … is complete". The text as signed is kept
 * with the signature (site_signoffs.declaration, site_returns.fixed_declaration) and printed on the
 * trade's report. Pure: the phone shows it, the server stores it, scripts/test-site-review.mjs checks it.
 */
import type { Trade } from './types';

/** The work in the declaration's words: "the roofing work at …". */
export const DECLARATION_WORK: Record<Trade, string> = { roofer: 'roofing', scaffolder: 'scaffolding', electrician: 'electrical', other: '' };

/** Everything after the first line: the same for every trade and for a put right. */
const REST = [
  '• the answers, photos and readings I have given are true and accurate; and',
  '• I have told Heliaxis about any defect, damage or problem I found or caused.',
  'I understand Heliaxis will rely on this declaration to raise my purchase order and complete the customer’s certification and handover, and will review my photos and results. If anything needs putting right, I will return to site to fix it under my Subcontractor Agreement.',
];
const DONE = 'is complete and was carried out to the design, the manufacturer’s instructions and the standards required by my Subcontractor Agreement with Heliaxis Limited;';

const where = (address: string) => address.trim() || 'this address';

/** The trade's declaration at sign-off, one line per paragraph or bullet. */
export function tradeDeclaration(trade: Trade, address: string): string {
  const work = DECLARATION_WORK[trade] ? `the ${DECLARATION_WORK[trade]} work` : 'the work';
  return ['I confirm that:', `• ${work} at ${where(address)} ${DONE}`, ...REST].join('\n');
}

/**
 * What the office asked, as it wrote it, in quotes on one line: it's often two sentences ("Two tiles
 * are lifted. Dress them back flat."), which only reads as part of the declaration quoted.
 */
export function whatWords(what: string): string {
  const t = what.replace(/\s+/g, ' ').trim();
  return t ? `“${t}”` : 'what Heliaxis asked for';
}

/** The Put right's declaration: "the work to put right {what} at {address} is complete…". */
export function putRightDeclaration(what: string, address: string): string {
  return ['I confirm that:', `• the work to put right ${whatWords(what)} at ${where(address)} ${DONE}`, ...REST].join('\n');
}

/* ── The electrician's records: what each one says, signed with the sign-off ─ */

/** The records an electrician's sign-off makes, each with the statement printed above their signature (WORDING-SPEC 0.7). */
export type RecordCode = 'HX-PV-01' | 'HX-PV-02' | 'HX-PV-03' | 'HX-BAT-01' | 'HX-BAT-02' | 'HX-HO-02';
export const RECORD_TITLE: Record<RecordCode, string> = {
  'HX-PV-01': 'Solar PV inspection record',
  'HX-PV-02': 'Solar PV string test results',
  'HX-PV-03': 'Solar PV switch-on record',
  'HX-BAT-01': 'Battery inspection record',
  'HX-BAT-02': 'Battery switch-on and test record',
  'HX-HO-02': 'System summary and sign-off',
};

/** "MCS MIS 3002 (solar PV) and MCS MIS 3012 (battery storage)": only the standards that apply to the job. */
export function summaryStandards(products: string[]): string {
  const out = [products.includes('solar') && 'MCS MIS 3002 (solar PV)', products.includes('battery') && 'MCS MIS 3012 (battery storage)'].filter(Boolean) as string[];
  return out.join(' and ') || 'MCS MIS 3002 (solar PV)';
}

/** The system summary's declarations (WORDING-SPEC 7.5): (a) the design, (b) the installation, (c) the note under both. */
export const SUMMARY_DECLARATIONS = {
  design: (standards: string) => `The design of this system is my responsibility. I did that work with reasonable care and skill and, as far as I know, the design meets ${standards}.`,
  install: (standards: string) => `Installing, inspecting and testing this system is my responsibility. I did that work with reasonable care and skill and, as far as I know, the work meets ${standards}.`,
  note: 'Each signature covers only the part that person signed for, and only the work set out in this summary.',
};

/** What each record says, with the address and the day filled in. */
export function recordStatement(code: RecordCode, address: string, date: string, products: string[] = []): string {
  const at = where(address);
  switch (code) {
    case 'HX-PV-01':
      return `I inspected the solar PV installation at ${at} on ${date}. This record shows what I found. Anything I marked as a problem is described in the notes, and I have told Heliaxis about it.`;
    case 'HX-PV-02':
      return 'I carried out these tests on the date shown with the tester listed above. The readings are the ones I took.';
    case 'HX-PV-03':
      return 'I switched this system on and made the checks above on the date shown.';
    case 'HX-BAT-01':
      return `I inspected the battery installation at ${at} on ${date}, on both the AC and the DC side, before it was switched on. This record shows what I found. Anything I marked as a problem is described in the notes, and I have told Heliaxis about it.`;
    case 'HX-BAT-02':
      return `I switched on and tested the battery system at ${at} on ${date}. These are the results. Any test that failed is described in the notes, and I have told Heliaxis about it.`;
    case 'HX-HO-02':
      return SUMMARY_DECLARATIONS.install(summaryStandards(products));
  }
}

export const RECORDS_HEAD = 'Your records. Signing also confirms what each of your records says:';

/** "21 October 2026", UK time: the day a declaration is signed. */
export const signDay = (at: Date = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' }).format(at);

/** The records a sign-off makes, from the sections on the assignment and the job's technologies. */
export function recordsFor(sections: readonly string[], products: string[]): RecordCode[] {
  const solar = products.includes('solar');
  const battery = products.includes('battery');
  const out: RecordCode[] = [];
  if (solar && sections.includes('pvinspect')) out.push('HX-PV-01');
  if (solar && sections.includes('pvtests')) out.push('HX-PV-02');
  if (solar && sections.includes('pvswitchon')) out.push('HX-PV-03');
  if (battery && sections.includes('battery')) out.push('HX-BAT-01', 'HX-BAT-02');
  if ((solar || battery) && sections.includes('summary')) out.push('HX-HO-02');
  return out;
}

/**
 * The electrician's declaration: the trade's, then "Your records" with one line per record made on
 * this job (its statement filled in), so what each record prints is what they signed.
 */
export function electricianDeclaration(address: string, sections: readonly string[], products: string[], date: string = signDay()): string {
  const lines = recordsFor(sections, products).map((r) => `• ${RECORD_TITLE[r]}: ${recordStatement(r, address, date, products)}`);
  return [tradeDeclaration('electrician', address), ...(lines.length ? [RECORDS_HEAD, ...lines] : [])].join('\n');
}

/** A record's statement as it was signed (from the declaration kept with the signature), or null when it isn't there. */
export function signedStatement(declaration: string | null | undefined, code: RecordCode): string | null {
  const head = `• ${RECORD_TITLE[code]}: `;
  const line = (declaration ?? '').split('\n').find((l) => l.startsWith(head));
  return line ? line.slice(head.length).trim() || null : null;
}
