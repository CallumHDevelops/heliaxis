import type { Brief } from './types';
import { tokens } from './brief';
import { htmlHeadings, htmlToText, internalLinks, wordCount } from './text';

/**
 * Refresh mode (spec §5 M4): compare a live page with the latest brief (built from the teardown) and suggest section
 * edits, never a rewrite. Pure.
 */

export type Suggestion = { kind: 'add' | 'expand' | 'answer' | 'links' | 'meta' | 'figures' | 'schema'; title: string; detail: string };

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
};

export function suggestEdits(input: { brief: Brief; html: string; title: string; description: string; path: string; site?: string; towns: string[]; schemaTypes?: string[] }): Suggestion[] {
  const { brief, towns } = input;
  const out: Suggestion[] = [];
  const headings = htmlHeadings(input.html);
  const text = htmlToText(input.html);
  const wc = wordCount(text);

  // Sections the top pages share that the page has no heading for.
  for (const o of brief.outline.filter((x) => x.source === 'shared' || x.source === 'teardown' || x.source === 'paa')) {
    const want = tokens(o.h2, towns);
    const covered = headings.some((h) => jaccard(tokens(h, towns), want) >= 0.4);
    if (!covered) out.push({ kind: 'add', title: `Add a section: ${o.h2}`, detail: `${o.why}. The page has no heading on it.` });
  }

  if (wc < brief.words.min * 0.85) {
    out.push({ kind: 'expand', title: `Expand the page (${wc.toLocaleString('en-GB')} words)`, detail: `${brief.words.note} Aim for ${brief.words.min.toLocaleString('en-GB')} to ${brief.words.max.toLocaleString('en-GB')}: add depth to the sections above rather than padding.` });
  }

  const lower = text.toLowerCase();
  for (const q of brief.questions) {
    const words = tokens(q, towns).filter((w) => w.length > 3);
    const hit = words.filter((w) => lower.includes(w));
    if (words.length && hit.length / words.length < 0.6) out.push({ kind: 'answer', title: `Answer: ${q}`, detail: 'Asked by searchers (People Also Ask or the top pages); the page does not answer it yet. A short FAQ entry or a sentence in the right section is enough.' });
  }

  const links = internalLinks([...input.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]), { site: input.site, self: input.path });
  if (links.length < 3) {
    const add = brief.linksOut.filter((l) => !links.includes(l.path)).slice(0, 3 - links.length);
    out.push({ kind: 'links', title: `Add internal links (${links.length} now)`, detail: add.length ? `Link to ${add.map((l) => l.path).join(', ')}.` : 'Link to at least 3 of our related pages.' });
  }

  const t = input.title.trim().length;
  const d = input.description.trim().length;
  if (t < 50 || t > 60) out.push({ kind: 'meta', title: `Title is ${t} characters`, detail: 'Rewrite it to 50 to 60 characters with the main search in it.' });
  if (d < 120 || d > 158) out.push({ kind: 'meta', title: `Description is ${d} characters`, detail: 'Rewrite it to 120 to 158 characters.' });

  if (/£\s?\d|\d\s?%/.test(text) && !/last checked/i.test(text)) out.push({ kind: 'figures', title: 'Date the figures', detail: 'The page gives prices or percentages without a "last checked" date. Check each against the packages and add the date.' });

  const missing = brief.schema.filter((s) => !(input.schemaTypes ?? []).includes(s));
  if (missing.length) out.push({ kind: 'schema', title: `Schema to add: ${missing.join(', ')}`, detail: 'The brief recommends it for this page type.' });

  return out;
}
