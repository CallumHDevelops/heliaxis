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
