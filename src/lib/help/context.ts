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

function split(raw: string) {
  const p = raw.split('#')[0];
  const q = p.indexOf('?');
  const pathname = (q < 0 ? p : p.slice(0, q)).replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(q < 0 ? '' : p.slice(q + 1));
  return { pathname, params };
}

/**
 * The articles about `from`: those whose `path` is `from` or a page above it (/admin/crm for a customer's
 * record at /admin/crm/<id>), keeping only the most specific. An article's own query (?view=board) must be
 * in `from` too, and one that has it comes first. The dashboard's /admin counts only on the dashboard.
 */
export function articlesForPath<T extends Pathed>(articles: T[], from: string): T[] {
  const clean = cleanFrom(from);
  if (!clean) return [];
  const here = split(clean);
  let best = -1;
  const found: { a: T; len: number; extra: number }[] = [];
  for (const a of articles) {
    if (!a.path) continue;
    const want = split(a.path);
    const under = here.pathname === want.pathname || (want.pathname !== '/admin' && here.pathname.startsWith(`${want.pathname}/`));
    if (!under) continue;
    let ok = true;
    let extra = 0;
    for (const [k, v] of want.params) {
      if (here.params.get(k) !== v) ok = false;
      else extra++;
    }
    if (!ok) continue;
    const len = want.pathname.length;
    best = Math.max(best, len);
    found.push({ a, len, extra });
  }
  return found
    .filter((f) => f.len === best)
    .sort((x, y) => y.extra - x.extra)
    .map((f) => f.a);
}
