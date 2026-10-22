/**
 * The print version of a generated document (the owner: "Maybe we can have a digital version and a
 * print version, print offers an ink saving?"): beside each document Heliaxis makes, wherever it can
 * be opened or downloaded, a small "Print version" link. It's the same document with nothing filled
 * (the kit's 'print' variant), made on request from what the stored copy was made from, and never
 * stored or sent: what's emailed, in the portal and in the handover pack stays the digital one.
 * Uploads and other people's documents (a certificate the electrician brought, a manual) have none.
 *
 * Shared with the browser: which documents have one, and the words for the link.
 */

export const PRINT_LABEL = 'Print version';
export const PRINT_TITLE = 'The same document without the cream page and dark bands, to save ink when you print it';

/** The documents the app makes and can make again as a print version, by their generated_key. */
const PRINTABLE = [
  /^PACK$/,
  /^(HX-PV-0[123]|HX-BAT-0[12]|HX-EV-01|HX-HP-01|EP_RECORD)$/,
  /^(RF_REPORT|SC_REPORT)$/,
  /^EIC\d*(_DRAFT)?$/,
  /^MEIWC\d*-\d+$/,
  /^(HX-HO-(01|02|06|08|09|10|11|12)|HX-HO-15-SHEET|HX-HO-16-SHEET|HX-HO-18-RECEIPT)$/,
  /^PO-\d+$/,
];

/** Does a document (its generated_key) have a print version? Uploads and their own certificate photos (CERT_OWN) don't. */
export const hasPrintVersion = (key: string | null | undefined): boolean => !!key && PRINTABLE.some((r) => r.test(key));

/** "?variant=print" on a document's own link (keeping what's there: ?download=1 → &variant=print). */
export const printHref = (href: string) => `${href}${href.includes('?') ? '&' : '?'}variant=print`;

/** "HX-0042 Solar PV string test results (print version).pdf". */
export const printName = (name: string) => `${name.replace(/\.pdf$/i, '')} (print version).pdf`;
