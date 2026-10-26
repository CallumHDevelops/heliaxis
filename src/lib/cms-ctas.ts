/**
 * Puts the two call-to-action bands into the published CMS homepage, where the CMS has no block for them:
 * one after "How it works" (just before the testimonials), one before the quote form. It only splits where
 * the HTML is balanced (between two top-level blocks), and skips a band whose spot it cannot find, so a
 * page that is laid out differently is left exactly as it is.
 */

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track', 'base']);

/** True when every tag opened before `idx` has been closed again, so cutting here leaves two valid pieces. */
export function balancedAt(html: string, idx: number): boolean {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  const prefix = html.slice(0, idx);
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(prefix))) {
    if (m[0].startsWith('<!--')) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      const at = stack.lastIndexOf(name);
      if (at < 0) return false;
      stack.length = at;
    } else if (!VOID.has(name) && !m[3]) {
      stack.push(name);
    }
  }
  // A cut in the middle of a tag is never balanced.
  const lastOpen = prefix.lastIndexOf('<');
  if (lastOpen > prefix.lastIndexOf('>')) return false;
  return stack.length === 0;
}

/** Index where the first tag matching `marker` begins, or -1. */
function blockStart(html: string, marker: RegExp): number {
  const m = marker.exec(html);
  if (!m) return -1;
  return html.lastIndexOf('<', m.index);
}

export type CtaSlot = 'survey' | 'talk';

/** The page cut into pieces with the CTA slots between them, in page order. */
export function splitForCtas(html: string): (string | { cta: CtaSlot })[] {
  const spots: { at: number; cta: CtaSlot }[] = [];
  const testi = blockStart(html, /class="[^"]*\bpv-testi\b/);
  if (testi > 0 && balancedAt(html, testi)) spots.push({ at: testi, cta: 'survey' });
  const quote = blockStart(html, /id="quote"/);
  if (quote > 0 && balancedAt(html, quote) && quote > (testi > 0 ? testi : 0)) spots.push({ at: quote, cta: 'talk' });
  spots.sort((a, b) => a.at - b.at);
  const out: (string | { cta: CtaSlot })[] = [];
  let from = 0;
  for (const s of spots) {
    out.push(html.slice(from, s.at), { cta: s.cta });
    from = s.at;
  }
  out.push(html.slice(from));
  return out;
}

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
  'html,body{max-width:100%;overflow-x:clip}' +
  '.pv-split{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}' +
  '.pv-splitcard{min-width:0;overflow-wrap:anywhere}' +
  '@media(max-width:760px){.pv-split{grid-template-columns:minmax(0,1fr)}.pv-splitcard{padding:24px}}';
