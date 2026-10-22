import type { HelpArticle, HelpLibrary } from './parse';
import { isStopWord, prepareIndex, queryTerms, searchPrepared, variants, wordsOf, type HelpIndexEntry, type PreparedEntry } from './search';
import { articleChunks, headingsOf, plainText } from './text';

/** Every article in reading order (sections in order, then their articles). */
export const allArticles = (lib: HelpLibrary): HelpArticle[] => lib.sections.flatMap((s) => s.articles);

/** A section and article by name: only names that are in the loaded content (no paths from the URL). */
export function findSection(lib: HelpLibrary, key: string) {
  return lib.sections.find((s) => s.key === key) ?? null;
}
export function findArticle(lib: HelpLibrary, key: string, slug: string) {
  const section = findSection(lib, key);
  const i = section ? section.articles.findIndex((a) => a.slug === slug) : -1;
  if (!section || i < 0) return null;
  return { section, article: section.articles[i], prev: section.articles[i - 1] ?? null, next: section.articles[i + 1] ?? null };
}

/** The compact index the search box gets: words, not sentences, for the body. */
export function buildHelpIndex(lib: HelpLibrary): HelpIndexEntry[] {
  let rank = 0;
  return lib.sections.flatMap((s) =>
    s.articles.map((a) => ({
      url: a.url,
      section: s.key,
      sectionTitle: s.title,
      title: a.title,
      summary: a.summary,
      keywords: a.keywords.join(', '),
      headings: headingsOf(a.body).map((h) => h.text),
      // Small words are left out of searches (unless that's all there is), so out of the index too.
      words: [...new Set(wordsOf(plainText(a.body)).filter((w) => (w.length > 1 || /\d/.test(w)) && !isStopWord(w)))].join(' '),
      rank: rank++,
    })),
  );
}

const WORDS_PER_PASSAGE = 220;
const trimWords = (text: string, n: number) => {
  const words = text.split(/(\s+)/);
  let count = 0;
  let out = '';
  for (const w of words) {
    if (w.trim()) count++;
    if (count > n) return `${out.trim()} …`;
    out += w;
  }
  return out.trim();
};

/** The parts of an article that answer `q` best (a short article whole), a few hundred words each. */
export function passagesFor(article: HelpArticle, q: string, max = 2): string[] {
  const chunks = articleChunks(article.body, { links: true });
  const text = (c: (typeof chunks)[number]) => [c.heading ? `${'#'.repeat(c.depth)} ${c.heading}` : '', c.text].filter(Boolean).join('\n');
  const total = chunks.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
  if (total <= WORDS_PER_PASSAGE * 1.5) return [trimWords(chunks.map(text).join('\n\n'), WORDS_PER_PASSAGE * 1.5)];
  const vars = queryTerms(q).map(variants);
  const scored = chunks.map((c, i) => {
    const head = wordsOf(c.heading ?? '');
    const body = wordsOf(c.text);
    const has = (ws: string[], v: string[]) => ws.some((w) => v.some((x) => w.startsWith(x)));
    const score = vars.reduce((n, v) => n + (has(head, v) ? 3 : 0) + (has(body, v) ? 1 : 0), 0);
    return { i, score };
  });
  const best = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i);
  // Nothing in particular: the start of the article.
  const pick = best.length ? best : [{ i: 0, score: 0 }];
  return pick.map(({ i }) => trimWords(text(chunks[i]), WORDS_PER_PASSAGE));
}

export type HelpAnswer = {
  title: string;
  url: string;
  section: string;
  summary: string;
  where: string | null;
  passages: string[];
};

/**
 * For Metis: the best articles for a question (every word first; if none has them all, the ones with the
 * most), with the passages that answer it.
 */
export function searchLibrary(lib: HelpLibrary, prepared: PreparedEntry[], q: string, n = 3): { results: HelpAnswer[]; matched: 'all' | 'some' | 'none' } {
  let hits = searchPrepared(prepared, q, { mode: 'all', limit: n });
  let matched: 'all' | 'some' | 'none' = 'all';
  if (!hits.length) {
    hits = searchPrepared(prepared, q, { mode: 'any', limit: n });
    matched = hits.length ? 'some' : 'none';
  }
  const byUrl = new Map(allArticles(lib).map((a) => [a.url, a]));
  const results = hits.flatMap((h) => {
    const a = byUrl.get(h.entry.url);
    return a ? [{ title: a.title, url: a.url, section: h.entry.sectionTitle, summary: a.summary, where: a.where, passages: passagesFor(a, q) }] : [];
  });
  return { results, matched };
}

export { prepareIndex };
