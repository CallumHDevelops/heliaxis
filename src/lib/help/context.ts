/**
 * Help for the page you're on: the Help links in the header, the account menu and the phone's More sheet
 * open /admin/help?from=<that page>, and Help shows the articles about it first (the ones whose `path` is
 * the longest match for it). No imports: safe in the browser.
 */

export const HELP_HOME = '/admin/help';

/** Metis with this already in its box, not sent (/admin/assistant?q=…). */
export const metisHref = (q = '') => (q.trim() ? `/admin/assistant?q=${encodeURIComponent(q.trim().slice(0, 500))}` : '/admin/assistant');

/** Where a Help link goes from this page (from Help itself: Help's home). */
export function helpHref(current: string): string {
  const from = cleanFrom(current);
  if (!from || from === HELP_HOME || from.startsWith(`${HELP_HOME}/`) || from.startsWith(`${HELP_HOME}?`)) return HELP_HOME;
  return `${HELP_HOME}?from=${encodeURIComponent(from)}`;
}

/** A page of this app ("/admin…", path and query only), or null. */
export function cleanFrom(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().split('#')[0];
  if (s.length > 400 || !/^\/admin(?=$|[/?])/.test(s) || /\/\/|\\/.test(s) || [...s].some((c) => c.charCodeAt(0) < 32)) return null;
  return s;
}

type Pathed = { path: string | null };

/**
 * A part of an article's `path` in square brackets stands for any one part of the address: /admin/crm/[id]
 * is every customer's page, /admin/projects/[id] every job's.
 */
export const isPlaceholder = (part: string) => /^\[[a-z][A-Za-z]*\]$/.test(part);

function split(raw: string) {
  const p = raw.split('#')[0];
  const q = p.indexOf('?');
  const pathname = (q < 0 ? p : p.slice(0, q)).replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(q < 0 ? '' : p.slice(q + 1));
  return { pathname, params };
}
const partsOf = (pathname: string) => pathname.split('/').filter(Boolean);

/** A path with a placeholder is a kind of page, not one page to open. */
export const hasPlaceholder = (path: string) => partsOf(split(path).pathname).some(isPlaceholder);

/**
 * The articles about `from`: those whose `path` is `from` or a page above it (/admin/crm for a customer's
 * record at /admin/crm/<id>), keeping only the most specific: the most parts, then the most parts named
 * rather than placeholders (so /admin/crm/[id] is a customer's page but /admin/crm/reports is the reports
 * page's own). An article's own query (?view=board) must be in `from` too, and one that has it comes first.
 * The dashboard's /admin counts only on the dashboard.
 */
export function articlesForPath<T extends Pathed>(articles: T[], from: string): T[] {
  const clean = cleanFrom(from);
  if (!clean) return [];
  const here = split(clean);
  const hereParts = partsOf(here.pathname);
  let best = -1;
  const found: { a: T; spec: number; extra: number }[] = [];
  for (const a of articles) {
    if (!a.path) continue;
    const want = split(a.path);
    const wantParts = partsOf(want.pathname);
    if (!wantParts.length || wantParts.length > hereParts.length) continue;
    if (wantParts.length === 1 && hereParts.length > 1) continue;
    if (!wantParts.every((w, i) => (isPlaceholder(w) ? !!hereParts[i] : w === hereParts[i]))) continue;
    let ok = true;
    let extra = 0;
    for (const [k, v] of want.params) {
      if (here.params.get(k) !== v) ok = false;
      else extra++;
    }
    if (!ok) continue;
    const spec = wantParts.length * 100 + wantParts.filter((w) => !isPlaceholder(w)).length;
    best = Math.max(best, spec);
    found.push({ a, spec, extra });
  }
  return found
    .filter((f) => f.spec === best)
    .sort((x, y) => y.extra - x.extra)
    .map((f) => f.a);
}
