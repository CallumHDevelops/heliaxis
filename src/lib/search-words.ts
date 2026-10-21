import { looksLikeRef } from './projects/refs';

/**
 * Searching word by word, for every search box (the dashboard's and the header's, the CRM's, Enquiries,
 * the WhatsApp dock): what's typed is split into words, and someone is found when every word turns up
 * somewhere on them (name, email, postcode, phone, a job's title or address, a reference), in any order.
 * "rob evans" and "evans rob" both find Robert Evans, "rob np15" the Robs in NP15, and accents don't
 * count ("sian" finds Siân). Each search box keeps its own rule for what one word matches; this is the
 * splitting, the folding and the order the results come in.
 *
 * Pure, so it runs in the browser, on the server and in scripts/test-search-words.mjs.
 */

/** At most this many words count; any after that are left off. */
export const MAX_WORDS = 5;
const MAX_LENGTH = 80;

/** Lower case with the accents off, for comparing: "Siân" → "sian", "Llŷr" → "llyr". */
export const fold = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// Never part of a word: what cleanSearch (src/lib/global-search.ts) takes out before a filter, and curly quotes.
const NOT_SEARCHED = /[,()%*\\"'`‘’“”]/g;
const POSTCODE = /^[a-z]{1,2}\d[a-z\d]?\d[a-z]{2}$/i;
const OUTWARD = /^[a-z]{1,2}\d[a-z\d]?$/i;
const INWARD = /^\d[a-z]{2}$/i;
const PHONE = /^[\d\s+-]*\d[\d\s+-]*$/;
// A number typed in groups starts 0… or +… ("07791 120089", "+44 7791"); "flat 2 12" isn't one.
const PHONE_START = /^(?:\+\d|0)[\d-]*$/;
const PHONE_GROUP = /^\d[\d-]*$/;

/**
 * The words of a search, as typed (accents and all), up to MAX_WORDS. A reference, postcode or phone
 * number typed with spaces stays one word, on its own or among others: "hx 42", "np15 1dg",
 * "07791 120089", "rob np15 1dg" → ["rob", "np15 1dg"]. The same word twice counts once.
 */
export function searchWords(q: string | null | undefined): string[] {
  const text = (q ?? '').replace(NOT_SEARCHED, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH).trim();
  if (!text) return [];
  if (looksLikeRef(text) || POSTCODE.test(text.replace(/\s/g, '')) || PHONE.test(text)) return [text];
  const parts = text.split(' ');
  const words: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    let w = parts[i];
    const next = parts[i + 1] ?? '';
    if (/^hx$/i.test(w) && looksLikeRef(`${w} ${next}`)) w = `${w} ${parts[++i]}`;
    else if (OUTWARD.test(w) && INWARD.test(next)) w = `${w} ${parts[++i]}`;
    else if (PHONE_START.test(w)) while (PHONE_GROUP.test(parts[i + 1] ?? '')) w = `${w} ${parts[++i]}`;
    if (!words.some((x) => fold(x) === fold(w))) words.push(w);
  }
  return words.slice(0, MAX_WORDS);
}

/** Does every word of `q` pass `test`? Yes when nothing's typed. */
export const everyWord = (q: string | null | undefined, test: (word: string) => boolean) => searchWords(q).every(test);

/** Is `word` somewhere in `text`, case and accents aside? */
export const hasText = (text: string | null | undefined, word: string) => fold(text).includes(fold(word));

/** A name's words, folded: "Siân O'Brien-Jones" → sian, o, brien, jones. */
const nameWords = (name: string | null | undefined) => fold(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * How well a name fits the search, for putting results in order (lowest first): 0 when the words start
 * the name's words in the order typed, from its first ("rob evans" or "rob" → Robert Evans); 1 the same
 * from a later word ("evans" → Robert Evans, "rob" → Jane Robson); 2 when they all start one but in
 * another order ("evans rob" → Robert Evans); and 3 more for each word that only turns up elsewhere
 * (inside a word, or in their email, postcode or job). Ties are left to each list's own order.
 */
export function nameRank(q: string | null | undefined, name: string | null | undefined): number {
  const parts = nameWords(name);
  let at = -1;
  let fromFirst = false;
  let inOrder = true;
  let misses = 0;
  for (const w of searchWords(q).map(fold)) {
    const i = parts.findIndex((p, k) => k > at && p.startsWith(w));
    if (i >= 0) {
      if (at < 0) fromFirst = i === 0;
      at = i;
    } else if (parts.some((p) => p.startsWith(w))) inOrder = false;
    else misses++;
  }
  return misses * 3 + (!inOrder ? 2 : fromFirst || at < 0 ? 0 : 1);
}

// ── In the database (PostgREST filters) ──

/**
 * The `.or()` filter for a search, given each word's alternatives ("name.ilike.%rob%", …): every word
 * has to match one of its own. One word is just its alternatives; several are and(or(…),or(…)). The
 * words must already be through cleanSearch, so there's no comma or bracket in them to change this.
 */
export const everyGroup = (groups: string[][]) =>
  groups.length === 1 ? groups[0].join(',') : `and(${groups.map((g) => `or(${g.join(',')})`).join(',')})`;

// The accented letters a name might have (Welsh to bach and the rest), by the plain letter they fold to.
const ACCENTED = 'àáâäãåāèéêëēìíîïīòóôöõōùúûüūŵẁẃẅýÿŷỳçñ';
const VARIANTS = new Map<string, string>();
for (const ch of ACCENTED) VARIANTS.set(fold(ch), `${VARIANTS.get(fold(ch)) ?? ''}${ch}${ch.toUpperCase()}`);

/**
 * The database's `ilike` minds accents, so a word also gets a pattern for `imatch` (a regular expression,
 * any case) where each letter may be accented: "sian" → s[iìíîïī…][aàáâ…]n, which finds Siân and Sian;
 * "Siân" typed finds both too. Only for words of plain letters and hyphens, so nothing in it can change
 * a filter's meaning; null for anything else.
 */
export function accentPattern(word: string): string | null {
  const w = fold(word);
  if (w.length > 24 || !/^[a-z-]+$/.test(w) || ![...w].some((c) => VARIANTS.has(c))) return null;
  return [...w].map((c) => (VARIANTS.has(c) ? `[${c}${VARIANTS.get(c)}]` : c)).join('');
}

/** A filter's alternatives without the accent patterns, for a database that refuses them. */
export const withoutAccents = (groups: string[][]) => groups.map((g) => g.filter((o) => !o.includes('.imatch.')));
