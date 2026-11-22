/**
 * The "?" help button on every staff page: which help to show for an address.
 * Pure functions, no imports from the app, so they are safe in the browser and easy to test.
 *
 * A path pattern is an admin address where a part in square brackets stands for any one part
 * (`/admin/crm/[id]` is every customer's page). An entry with `tree: true` also covers every page below
 * it (`/admin/cms` covers `/admin/cms/home`). The most specific match wins: the one with the most parts,
 * then the one with the most named (not bracketed) parts.
 */

export type HelpLink = { label: string; href: string };

export type HelpEntry = {
  /** The page this is for, e.g. `/admin/sales/estimator` or `/admin/crm/[id]`. */
  path: string;
  /** Also covers every page below this one. */
  tree?: boolean;
  /** The panel's heading: the page's name. */
  title: string;
  /** What the page is for: one or two short sentences. */
  about: string;
  /** The main things you can do, in the order you would do them. */
  steps: string[];
  /** Things that catch people out. */
  watch?: string[];
  /** Pages to read next (Help articles, the CMS guide). */
  more?: HelpLink[];
};

export type HelpMatch = { entry: HelpEntry; exact: boolean };

const isPlaceholder = (part: string) => /^\[[A-Za-z][A-Za-z0-9]*\]$/.test(part);

/** The parts of an address, without the query, a hash or trailing slashes. */
export function partsOf(raw: string): string[] {
  const clean = raw.split('#')[0].split('?')[0];
  return clean.split('/').filter(Boolean);
}

function score(pattern: string[], here: string[], tree: boolean): { ok: boolean; exact: boolean; named: number } {
  const no = { ok: false, exact: false, named: 0 };
  if (pattern.length > here.length) return no;
  if (!tree && pattern.length !== here.length) return no;
  let named = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    if (isPlaceholder(pattern[i])) continue;
    if (pattern[i] !== here[i]) return no;
    named += 1;
  }
  return { ok: true, exact: pattern.length === here.length, named };
}

/** The help for this address, or null when no entry covers it (the caller then shows the generic help). */
export function findHelp(entries: readonly HelpEntry[], pathname: string): HelpMatch | null {
  const here = partsOf(pathname);
  if (here[0] !== 'admin') return null;
  let best: { entry: HelpEntry; exact: boolean; len: number; named: number } | null = null;
  for (const entry of entries) {
    const pattern = partsOf(entry.path);
    const s = score(pattern, here, !!entry.tree);
    if (!s.ok) continue;
    if (!best || pattern.length > best.len || (pattern.length === best.len && s.named > best.named)) {
      best = { entry, exact: s.exact, len: pattern.length, named: s.named };
    }
  }
  return best ? { entry: best.entry, exact: best.exact } : null;
}

/** Is this a website (CMS) page? Those link to the CMS guide from the help panel. */
export const isCmsPath = (pathname: string) => {
  const p = partsOf(pathname);
  return p[0] === 'admin' && (p[1] === 'cms' || p[1] === 'cms-guide' || p[1] === 'blog' || p[1] === 'content');
};

/** A readable name for a page with no entry yet: its last named part ("/admin/social/costs" -> "Costs"). */
export function nameFor(pathname: string): string {
  const named = partsOf(pathname)
    .slice(1)
    .filter((p) => !/^[0-9a-f-]{8,}$/i.test(p) && !isPlaceholder(p));
  const last = named.at(-1);
  if (!last) return 'Dashboard';
  const words = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'This page';
}
