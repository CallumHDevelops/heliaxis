import type { Draft, DraftBlock } from './types';

/**
 * Text helpers for the checks: the words a draft (or a published page) shows, its links, and word shingles for the
 * originality check. Pure.
 */

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&pound;': '£', '&ndash;': '–', '&mdash;': '—' };

export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|tr|div|section|blockquote)>/gi, '. ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\.\s*){2,}/g, '. ')
    .trim();
}

/** Fields that are settings, not words a reader sees. */
const NOT_TEXT = /^(t|id|img|icon|lIcon|rIcon|side|fit|cols|fill|anchor|dark|theme|stars|speed|featured|featuredIndex|hl|pulse|ctaPulse|textWide|hide[A-Z].*|.*Disabled|.*Href|href|_.*)$/;

function walk(v: unknown, key: string, out: string[], links: string[]) {
  if (v == null) return;
  if (typeof v === 'string') {
    if (/href$/i.test(key)) {
      if (v.trim()) links.push(v.trim());
      return;
    }
    if (NOT_TEXT.test(key)) return;
    if (/<[a-z][^>]*>/i.test(v)) {
      for (const m of v.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) links.push(m[1]);
      out.push(htmlToText(v));
    } else out.push(v);
    return;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return;
  if (Array.isArray(v)) {
    for (const x of v) walk(x, key, out, links);
    return;
  }
  if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k, out, links);
}

export function blocksText(blocks: DraftBlock[] | undefined): { text: string; links: string[]; headings: string[] } {
  const out: string[] = [];
  const links: string[] = [];
  const headings: string[] = [];
  for (const b of blocks ?? []) {
    if (!b || typeof b !== 'object') continue;
    const p = (b.p ?? {}) as Record<string, unknown>;
    for (const k of ['title', 'headline', 'lt', 'rt']) if (typeof p[k] === 'string' && p[k]) headings.push(String(p[k]));
    if (typeof p.html === 'string') for (const m of p.html.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)) headings.push(htmlToText(m[1]));
    walk(p, '', out, links);
  }
  return { text: out.filter(Boolean).join('. ').replace(/\s+/g, ' ').trim(), links, headings };
}

/** The article fields the blog template shows, in reading order. */
const ARTICLE_FIELDS = ['headline', 'sub', 'introTitle', 'introText', 'bodyHtml1', 'ctaHeadline', 'ctaSub', 'bodyHtml2', 'homeTitle', 'homeDesc', 'homeBullets', 'businessTitle', 'businessDesc', 'businessBullets'];

export function articleText(a: Record<string, unknown> | undefined): { text: string; links: string[]; headings: string[] } {
  const out: string[] = [];
  const links: string[] = [];
  const headings: string[] = [];
  if (!a) return { text: '', links, headings };
  for (const f of ARTICLE_FIELDS) walk(a[f], f, out, links);
  for (const f of ['headline', 'introTitle']) if (typeof a[f] === 'string') headings.push(String(a[f]));
  for (const f of ['bodyHtml1', 'bodyHtml2']) {
    const h = String(a[f] ?? '');
    for (const m of h.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)) headings.push(htmlToText(m[1]));
  }
  return { text: out.filter(Boolean).join('. ').replace(/\s+/g, ' ').trim(), links, headings };
}

export function draftText(d: Pick<Draft, 'kind' | 'blocks' | 'article'>) {
  return d.kind === 'blog' ? articleText(d.article) : blocksText(d.blocks);
}

/** Headings in a published page's HTML. */
export function htmlHeadings(html: string): string[] {
  return [...String(html || '').matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => htmlToText(m[2])).filter(Boolean);
}

export const wordCount = (text: string) => (String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Internal paths a draft links to (distinct, without the anchor or the page itself). "#quote" is a form, not a page. */
export function internalLinks(links: string[], opts: { site?: string; self?: string } = {}): string[] {
  const host = (() => {
    try {
      return opts.site ? new URL(opts.site).host.replace(/^www\./, '') : 'heliaxis.co.uk';
    } catch {
      return 'heliaxis.co.uk';
    }
  })();
  const self = normPath(opts.self ?? '');
  const out = new Set<string>();
  for (const raw of links) {
    const l = String(raw || '').trim();
    let path = '';
    if (l.startsWith('/') && !l.startsWith('//')) path = l;
    else if (/^https?:\/\//i.test(l)) {
      try {
        const u = new URL(l);
        if (u.host.replace(/^www\./, '') === host) path = u.pathname;
      } catch {
        /* not a link */
      }
    }
    if (!path) continue;
    const p = normPath(path.split('#')[0].split('?')[0]);
    if (!p || p === self) continue;
    out.add(p);
  }
  return [...out];
}

export function normPath(p: string): string {
  const s = String(p || '').trim().toLowerCase();
  if (!s) return '';
  const withSlash = s.startsWith('/') ? s : `/${s}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/* ── Shingles (originality) ─────────────────────────────────────────────────────────────────────────────────────── */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Words for shingling: lower case, numbers made one token, and every town name made one token, so a copy of a page with
 * only the town swapped (and the figures changed) still matches itself.
 */
export function shingleWords(text: string, towns: string[] = []): string[] {
  let s = ` ${String(text || '').toLowerCase()} `;
  const names = [...new Set(towns.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 2))].sort((a, b) => b.length - a.length);
  if (names.length) s = s.replace(new RegExp(`(?<![\\p{L}])(${names.map(escapeRe).join('|')})(?![\\p{L}])`, 'gu'), ' xtownx ');
  s = s.replace(/£?\d[\d,.]*/g, ' xnumx ');
  return s.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function shingles(text: string, towns: string[] = [], size = 5): Set<string> {
  const w = shingleWords(text, towns);
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(' '));
  return out;
}

/** Share of the draft's shingles that also appear in the other text (0 to 1). */
export function overlap(draft: Set<string>, other: Set<string>): number {
  if (!draft.size || !other.size) return 0;
  let hit = 0;
  for (const s of draft) if (other.has(s)) hit++;
  return hit / draft.size;
}
