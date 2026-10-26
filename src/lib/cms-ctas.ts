/**
 * Changes made to published CMS pages when they are shown on the website, without republishing from the CMS:
 *  - the two call-to-action bands on the homepage (after "How it works", and before the quote form),
 *  - the old quote form swapped for the current step-by-step one (homepage and blog articles),
 *  - the old logo swapped for the current one,
 *  - a few CSS fixes.
 * The CMS wraps every block in `<div class="pv-page"><div style="...spacing">BLOCK</div>…</div>`, so a cut is made
 * between two of those wrappers, and the outer wrapper is closed and re-opened around the new piece. A page laid
 * out differently is left exactly as it is.
 */

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track', 'base']);
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;

type Open = { name: string; start: number; openEnd: number; tag: string };

/** The tags still open at `idx`, outermost first, or null when `idx` is inside a tag or the markup is broken. */
function stackAt(html: string, idx: number): Open[] | null {
  const prefix = html.slice(0, idx);
  const lastOpen = prefix.lastIndexOf('<');
  if (lastOpen > prefix.lastIndexOf('>')) return null;
  const stack: Open[] = [];
  const re = new RegExp(TAG.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(prefix))) {
    if (m[0].startsWith('<!--')) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at < 0) return null;
      stack.length = at;
    } else if (!VOID.has(name) && !m[3]) {
      stack.push({ name, start: m.index, openEnd: m.index + m[0].length, tag: m[0] });
    }
  }
  return stack;
}

/** True when every tag opened before `idx` has been closed again, so cutting here leaves two valid pieces. */
export function balancedAt(html: string, idx: number): boolean {
  const s = stackAt(html, idx);
  return !!s && s.length === 0;
}

/** Index just after the closing tag of the element that starts at `start`, or -1. */
function elementEnd(html: string, start: number): number {
  const re = new RegExp(TAG.source, 'g');
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      depth--;
      if (depth === 0) return m.index + m[0].length;
      if (depth < 0) return -1;
    } else if (!VOID.has(name) && !m[3]) depth++;
    else if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** Index where the first tag matching `marker` begins, or -1. */
function tagStart(html: string, marker: RegExp): number {
  const m = marker.exec(html);
  return m ? html.lastIndexOf('<', m.index) : -1;
}

export type CtaSlot = 'survey' | 'talk';
export type Part = string | { cta: CtaSlot } | { quote: true };

/**
 * Where a block sits as a whole: its start and end including the spacing wrapper the CMS puts around it, and the
 * outer wrapper (if any) that has to be closed and re-opened around a cut. Null when the block is somewhere unexpected.
 */
function blockSpan(html: string, at: number): { start: number; end: number; outer: Open | null } | null {
  if (at < 0) return null;
  const s = stackAt(html, at);
  if (!s) return null;
  // Top level: the block itself.
  if (s.length === 0) {
    const end = elementEnd(html, at);
    return end < 0 ? null : { start: at, end, outer: null };
  }
  // Inside exactly one spacing wrapper that starts right at the block (and one outer page wrapper at most).
  const wrap = s[s.length - 1];
  if (wrap.name !== 'div' || html.slice(wrap.openEnd, at).trim() !== '') return null;
  const above = stackAt(html, wrap.start);
  if (!above || above.length > 1) return null;
  const end = elementEnd(html, wrap.start);
  return end < 0 ? null : { start: wrap.start, end, outer: above[0] ?? null };
}

export type SplitOptions = { ctas?: boolean; quote?: boolean };

/** The page cut into pieces with the CTA bands and the new quote form between them, in page order. */
export function splitCmsPage(html: string, opts: SplitOptions): Part[] {
  type Cut = { start: number; end: number; part: Part; outer: Open | null };
  const cuts: Cut[] = [];
  const testi = opts.ctas ? blockSpan(html, tagStart(html, /class="[^"]*\bpv-testi\b/)) : null;
  const quote = blockSpan(html, tagStart(html, /id="quote"/));
  if (testi && (!quote || quote.start > testi.start)) cuts.push({ start: testi.start, end: testi.start, part: { cta: 'survey' }, outer: testi.outer });
  if (quote && (opts.ctas || opts.quote)) {
    if (opts.ctas) cuts.push({ start: quote.start, end: quote.start, part: { cta: 'talk' }, outer: quote.outer });
    if (opts.quote) cuts.push({ start: quote.start, end: quote.end, part: { quote: true }, outer: quote.outer });
  }
  if (!cuts.length) return [html];

  const outer = cuts.find((c) => c.outer)?.outer ?? null;
  // Every cut must share the same outer wrapper (or none), or the page is left alone.
  if (cuts.some((c) => (c.outer?.start ?? -1) !== (outer?.start ?? -1))) return [html];
  const open = outer?.tag ?? '';
  const close = outer ? `</${outer.name}>` : '';

  cuts.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  const out: Part[] = [];
  let from = 0;
  cuts.forEach((c, i) => {
    out.push((i === 0 ? '' : open) + html.slice(from, c.start) + close, c.part);
    from = c.end;
  });
  out.push(open + html.slice(from));
  return out.filter((p) => p !== '' && !(typeof p === 'string' && p === open + close));
}

/** @deprecated kept for the older tests: both CTA bands, no quote swap. */
export const splitForCtas = (html: string) => splitCmsPage(html, { ctas: true });

/** The old black-and-yellow wordmark file, swapped for the current one (with the ®) wherever a saved CMS page still names it. */
export function freshenLogo(html: string): string {
  return html.split('/assets/heliaxis-logo.png').join('/assets/heliaxis-logo-doc.png');
}

/**
 * Fixes applied on top of the published CMS styles, so they take effect without republishing: the home/business
 * cards stack on a phone, and nothing can push the page wider than the screen. (The same split-card rule is in
 * cms.css for the next publish.)
 */
export const LIVE_FIXES_CSS =
  'html,body{max-width:100%;overflow-x:clip;height:auto;min-height:0}' +
  // The site footer must always show, whatever an older published snapshot's styles say, with its bottom links in a row.
  'footer{display:block!important;background:#2c2820;color:#a69f8e}' +
  'footer a{color:#a69f8e}footer .base a{display:inline;margin:0}' +
  // The quote form's phone link keeps the site's colours inside a CMS page.
  '#quote .tel{color:#211f18;text-decoration:none}#quote .why a{color:inherit}' +
  '.pv-split{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}' +
  '.pv-splitcard{min-width:0;overflow-wrap:anywhere}' +
  '@media(max-width:760px){.pv-split{grid-template-columns:minmax(0,1fr)}.pv-splitcard{padding:24px}}';
