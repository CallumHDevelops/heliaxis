import { normalizeCmsSlug } from '@/lib/blog/cms-article-template';

/**
 * The website editor saves its whole document from the browser. A tab opened before the Search content studio
 * published a page does not have that page, so its next save would delete it. These keep the studio's pages that the
 * server has and the browser's document lacks (matched by id, then by slug). Pure.
 *
 * The cost: a studio page deleted in the editor comes back on the next save. Take a studio page down from Search
 * (or remove its origin marker) instead.
 */

type Page = { id?: unknown; slug?: unknown; origin?: unknown; searchStudio?: unknown; [k: string]: unknown };

export const isStudioPage = (p: Page | null | undefined) => !!p && (p.origin === 'search-studio' || p.searchStudio === true);

const parse = (raw: string | null | undefined): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const slugOf = (p: Page) => normalizeCmsSlug(String(p.slug || ''));

/** The browser's document with the server's missing studio pages added back. Unchanged text when nothing is missing. */
export function keepStudioPages(incoming: string, server: string | null | undefined): { value: string; kept: string[] } {
  const inc = parse(incoming);
  const srv = parse(server);
  if (!inc || !Array.isArray(inc.pages) || !srv || !Array.isArray(srv.pages)) return { value: incoming, kept: [] };
  const pages = inc.pages as Page[];
  const ids = new Set(pages.map((p) => String(p?.id ?? '')).filter(Boolean));
  const slugs = new Set(pages.map((p) => (p?.slug ? slugOf(p) : '')).filter(Boolean));
  const missing = (srv.pages as Page[]).filter((p) => isStudioPage(p) && !ids.has(String(p.id ?? '')) && !slugs.has(slugOf(p)));
  if (!missing.length) return { value: incoming, kept: [] };
  return { value: JSON.stringify({ ...inc, pages: [...pages, ...missing] }), kept: missing.map(slugOf) };
}

/** The browser's rendered snapshot with the server's rendered entries for `slugs` added where missing. */
export function keepRenderedPages(incoming: unknown, server: string | null | undefined, slugs: string[]): unknown {
  if (!slugs.length || !incoming || typeof incoming !== 'object') return incoming;
  const inc = incoming as { pages?: Page[] };
  const srv = parse(server) as { pages?: Page[] } | null;
  if (!Array.isArray(inc.pages) || !srv || !Array.isArray(srv.pages)) return incoming;
  const have = new Set(inc.pages.map(slugOf));
  const want = new Set(slugs.map((s) => normalizeCmsSlug(s)));
  const add = srv.pages.filter((p) => want.has(slugOf(p)) && !have.has(slugOf(p)));
  return add.length ? { ...inc, pages: [...inc.pages, ...add] } : incoming;
}
