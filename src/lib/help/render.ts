import { Marked, Renderer, type Token, type Tokens } from 'marked';

/**
 * An article's Markdown as HTML for /admin/help (styled by src/app/admin/help/help.css). Our own files
 * from the repo, so the HTML is trusted, as the setup guides are. On top of plain Markdown:
 * - a blockquote that starts with **Good to know:**, **Watch out:**, **Admins only:** or **Once switched
 *   on:** is a callout, each kind styled on its own;
 * - a picture on its own line is a framed figure with its title as the caption;
 * - tables scroll inside their own box; headings get ids, and the ## and ### ones are listed (On this page);
 * - links to other sites open in a new tab;
 * - HTML comments are left out: `<!-- shot: <section>/<file>.jpg | Caption | alt -->` marks a picture still
 *   to be taken, and shows nothing until it's a real picture.
 */

export const CALLOUTS = {
  'Good to know': 'good',
  'Watch out': 'watch',
  'Admins only': 'admin',
  'Once switched on': 'switch',
} as const;
export type CalloutKind = (typeof CALLOUTS)[keyof typeof CALLOUTS];

export type HelpTocEntry = { id: string; text: string; depth: 2 | 3 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export const slugifyHeading = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'part';

/** The label a blockquote starts with (`**Good to know:**`, or `**Good to know**:`), if any bold one. */
export function calloutLabel(token: Tokens.Blockquote): string | null {
  const p = token.tokens[0];
  if (p?.type !== 'paragraph') return null;
  const first = (p as Tokens.Paragraph).tokens[0];
  if (first?.type !== 'strong') return null;
  const next = (p as Tokens.Paragraph).tokens[1];
  const own = (first as Tokens.Strong).text.trim();
  if (own.endsWith(':')) return own.slice(0, -1).trim();
  if (next?.type === 'text' && (next as Tokens.Text).text.startsWith(':')) return own;
  return null;
}

/** A callout: its kind and what's in it with the label taken off. Null for a plain blockquote. */
export function calloutOf(token: Tokens.Blockquote): { kind: CalloutKind; label: string; tokens: Token[] } | null {
  const label = calloutLabel(token);
  if (!label || !(label in CALLOUTS)) return null;
  const p = token.tokens[0] as Tokens.Paragraph;
  const inline = p.tokens.slice(1);
  const next = inline[0];
  if (next?.type === 'text') {
    const t = next as Tokens.Text;
    const text = t.text.replace(/^:?\s*/, '');
    inline[0] = { ...t, text, raw: t.raw.replace(/^:?\s*/, '') };
    if (!text && !t.tokens?.length) inline.shift();
  }
  const rest = token.tokens.slice(1);
  const tokens: Token[] = inline.length ? [{ ...p, tokens: inline }, ...rest] : rest;
  return { kind: CALLOUTS[label as keyof typeof CALLOUTS], label, tokens };
}

const ICON = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CALLOUT_ICONS: Record<CalloutKind, string> = {
  good: ICON('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/>'),
  watch: ICON('<path d="M10.3 4.2 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>'),
  admin: ICON('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>'),
  switch: ICON('<path d="M12 3v8"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>'),
};

const isPicture = (t: Token) => t.type === 'image';
const isBlank = (t: Token) => (t.type === 'text' && !(t as Tokens.Text).text.trim()) || t.type === 'br';

/** A placeholder for a picture not taken yet (shot:…): shown as nothing. */
const placeholder = (href: string) => /^shot:/i.test(href);

/** Raw HTML without its comments (a picture still to be taken, a note to whoever edits the file). */
export const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?(?:-->|$)/g, '');

export function renderHelp(md: string): { html: string; toc: HelpTocEntry[] } {
  const toc: HelpTocEntry[] = [];
  const used = new Map<string, number>();
  const idFor = (text: string) => {
    const base = slugifyHeading(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };
  const figure = (img: Tokens.Image) => {
    if (placeholder(img.href)) return '';
    const caption = img.title ? `<figcaption>${esc(img.title)}</figcaption>` : '';
    return `<figure class="hp-fig"><div class="hp-fig__frame"><img src="${esc(img.href)}" alt="${esc(img.text)}" loading="lazy" decoding="async"></div>${caption}</figure>\n`;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: Renderer, { tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        // No # in articles (the page has the title): one would come out as a ##.
        const d = Math.min(6, Math.max(2, depth));
        const text = unesc(inner.replace(/<[^>]*>/g, '')).trim();
        const id = idFor(text);
        if (d <= 3) toc.push({ id, text, depth: d as 2 | 3 });
        return `<h${d} id="${id}">${inner}</h${d}>\n`;
      },
      blockquote(this: Renderer, token: Tokens.Blockquote) {
        const c = calloutOf(token);
        if (!c) return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
        return `<aside class="hp-callout hp-callout--${c.kind}" role="note"><p class="hp-callout__label">${CALLOUT_ICONS[c.kind]}<span>${c.label}</span></p><div class="hp-callout__body">${this.parser.parse(c.tokens)}</div></aside>\n`;
      },
      paragraph(this: Renderer, { tokens }: Tokens.Paragraph) {
        const real = tokens.filter((t) => !isBlank(t));
        if (real.length && real.every(isPicture)) return real.map((t) => figure(t as Tokens.Image)).join('');
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      image({ href, title, text }: Tokens.Image) {
        if (placeholder(href)) return '';
        return `<img src="${esc(href)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy" decoding="async">`;
      },
      table(this: Renderer, token: Tokens.Table) {
        return `<div class="hp-table" role="region" aria-label="Table" tabindex="0">${Renderer.prototype.table.call(this, token)}</div>\n`;
      },
      html({ text, block }: Tokens.HTML | Tokens.Tag) {
        const out = withoutComments(text);
        return block && !out.trim() ? '' : out;
      },
      link(this: Renderer, { href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const away = /^https?:\/\//i.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${away ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`;
      },
    },
  });
  const html = marked.parse(md, { async: false });
  return { html, toc };
}
