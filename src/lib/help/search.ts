/**
 * Searching Help: the index the server builds (src/lib/help/library.ts) and the ranking, shared by the
 * search box on /admin/help (in the browser, as you type) and Metis's search_help tool. Every word typed
 * must match the start of a word in the article (so "temp" finds Templates); small words like "how" and
 * "the" are left out. A match in the title counts most, then the keywords, the headings, the summary and
 * the body. No imports: safe in the browser.
 */

export type HelpIndexEntry = {
  url: string;
  section: string;
  sectionTitle: string;
  title: string;
  summary: string;
  keywords: string;
  headings: string[];
  /** Every distinct word of the body, normalised, space-separated (compact: no sentences). */
  words: string;
  /** Position in the whole of Help (section order, then article order): breaks ties. */
  rank: number;
};

export const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘]/g, '');

export const wordsOf = (s: string) => normalise(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Words that say nothing about what's wanted ("how do I add a customer" → add, customer). */
const STOP = new Set(
  'a an and any are as at be by can could do does doing for from get got have how i if in into is it its me my of on or our please should so that the their them then there this to up us want was we what whats when where which who why will with would you your'.split(
    ' ',
  ),
);

export const isStopWord = (w: string) => STOP.has(w);

/** The words to look for: distinct, small words dropped (unless that's all there is), at most 8. */
export function queryTerms(q: string): string[] {
  const all = [...new Set(wordsOf(q))];
  const real = all.filter((w) => !STOP.has(w));
  return (real.length ? real : all).slice(0, 8);
}

/** A word and its plain forms: "templates" also as "template", "approved" as "approv(e)", "sending" as "send". */
export function variants(term: string): string[] {
  const out = [term];
  const add = (v: string) => v.length >= 3 && !out.includes(v) && out.push(v);
  if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) add(term.slice(0, -1));
  if (term.length > 4 && term.endsWith('es')) add(term.slice(0, -2));
  if (term.length > 4 && term.endsWith('ies')) add(`${term.slice(0, -3)}y`);
  if (term.length > 4 && term.endsWith('ed')) {
    add(term.slice(0, -1));
    add(term.slice(0, -2));
  }
  if (term.length > 5 && term.endsWith('ing')) add(term.slice(0, -3));
  return out;
}

const FIELDS = [
  ['title', 100],
  ['keywords', 50],
  ['headings', 25],
  ['summary', 12],
  ['words', 3],
] as const;
type Field = (typeof FIELDS)[number][0];

export type PreparedEntry = { entry: HelpIndexEntry; f: Record<Field, string[]>; headingWords: string[][]; titleNorm: string };

/** Split once, search many times. */
export function prepareIndex(entries: HelpIndexEntry[]): PreparedEntry[] {
  return entries.map((entry) => {
    const headingWords = entry.headings.map(wordsOf);
    return {
      entry,
      headingWords,
      titleNorm: wordsOf(entry.title).join(' '),
      f: {
        title: wordsOf(entry.title),
        keywords: wordsOf(entry.keywords),
        headings: headingWords.flat(),
        summary: wordsOf(entry.summary),
        words: entry.words ? entry.words.split(' ') : [],
      },
    };
  });
}

/** 1 for a whole word, 0.8 for the start of one, 0 for none. */
function hit(words: string[], vars: string[]): number {
  let best = 0;
  for (const w of words) {
    for (const v of vars) {
      if (w === v) return 1;
      if (best < 0.8 && w.startsWith(v)) best = 0.8;
    }
  }
  return best;
}

export type HelpHit = {
  entry: HelpIndexEntry;
  score: number;
  /** How many of the words it has. */
  matched: number;
  /** The heading that matched best, when the title alone doesn't explain the match. */
  heading: string | null;
};

/**
 * `all`: every word must match (the search box). `any`: at least one, most words first (the "closest
 * matches" when nothing has them all, and Metis when a question's wording isn't the articles').
 */
export function searchPrepared(prepared: PreparedEntry[], q: string, { mode = 'all', limit = 50 }: { mode?: 'all' | 'any'; limit?: number } = {}): HelpHit[] {
  const terms = queryTerms(q);
  if (!terms.length) return [];
  const vars = terms.map(variants);
  const phrase = terms.join(' ');
  const hits: HelpHit[] = [];
  for (const p of prepared) {
    let score = 0;
    let matched = 0;
    let titleAll = true;
    for (const v of vars) {
      let best = 0;
      for (const [field, weight] of FIELDS) {
        const h = hit(p.f[field], v);
        if (h) best = Math.max(best, h * weight);
        if (field === 'title' && !h) titleAll = false;
      }
      if (best) {
        matched++;
        score += best;
      }
    }
    if (!matched || (mode === 'all' && matched < terms.length)) continue;
    if (terms.length > 1 && p.titleNorm.includes(phrase)) score += 60;
    if (terms.length > 1 && titleAll) score += 30;
    if (vars[0].some((x) => p.f.title[0]?.startsWith(x))) score += 5;
    let heading: string | null = null;
    if (!titleAll) {
      let most = 0;
      p.headingWords.forEach((hw, i) => {
        const n = vars.filter((v) => hit(hw, v)).length;
        if (n > most) {
          most = n;
          heading = p.entry.headings[i];
        }
      });
    }
    hits.push({ entry: p.entry, score, matched, heading });
  }
  hits.sort((a, b) => (mode === 'any' ? b.matched - a.matched : 0) || b.score - a.score || a.entry.rank - b.entry.rank);
  return hits.slice(0, limit);
}

/** `text` in pieces, with the words that match marked (the start of the word, as typed). */
export function highlightParts(text: string, q: string): { text: string; hit: boolean }[] {
  const vars = queryTerms(q).map(variants);
  if (!vars.length) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  const push = (t: string, h: boolean) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.hit === h) last.text += t;
    else out.push({ text: t, hit: h });
  };
  const re = /[A-Za-z0-9À-ɏ'’]+/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    const word = m[0];
    const norm = normalise(word).replace(/[^a-z0-9]/g, '');
    let len = 0;
    for (const v of vars) for (const x of v) if (norm.startsWith(x)) len = Math.max(len, x.length);
    if (!len) continue;
    const start = m.index ?? 0;
    // Mark the part typed; the whole word when accents or apostrophes make the lengths differ.
    const n = norm.length === word.length ? Math.min(word.length, len) : word.length;
    push(text.slice(at, start), false);
    push(text.slice(start, start + n), true);
    at = start + n;
  }
  push(text.slice(at), false);
  return out;
}
