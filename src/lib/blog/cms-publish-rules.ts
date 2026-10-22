/**
 * What a CMS save or Publish may change about blog articles. Safe for any server code (no next/cache).
 *
 * An article's status (Draft, Scheduled, Live) is the server's: Schedule, Unschedule, Unpublish, the
 * scheduled-publish job and publishing that one article change it. An editor tab saves and publishes the
 * whole site, and a tab opened before an article was scheduled or taken down still has the old status, so
 * each article keeps the status the server has (one the server doesn't have is a draft), except the one
 * being published, which goes live now. Only live articles are in the published copy and on the website.
 */
import { isCmsBlogPage, normalizeCmsSlug, toPublicBlogPath } from './cms-article-template';
import type { CmsLoosePage, CmsState } from './cms-blog-shared';

const STATUS_FIELDS = ['blogStatus', 'publishAt', 'scheduledRender'] as const;

export const isLiveBlog = (pg: CmsLoosePage) => String(pg.blogStatus || '').toLowerCase() === 'published';

/** The site as an editor tab sent it, with each article's status as the server has it; `publishId` goes live now. */
export function keepServerBlogStatus(incoming: CmsState, server: CmsState, publishId: string | null, now = new Date()): CmsState {
  if (!incoming || !Array.isArray(incoming.pages)) return incoming;
  const saved = new Map((server.pages ?? []).filter((p) => isCmsBlogPage(p) && p.id).map((p) => [String(p.id), p]));
  const pages = incoming.pages.map((pg) => {
    if (!isCmsBlogPage(pg)) return pg;
    const was = pg.id ? saved.get(String(pg.id)) : undefined;
    const out: CmsLoosePage = { ...pg };
    if (publishId && String(pg.id) === publishId) {
      // Live now; an article live before keeps its first date, a scheduled one is dated now.
      const at = new Date(String(was?.publishAt || pg.publishAt || ''));
      out.blogStatus = 'published';
      out.publishAt = !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime() ? at.toISOString() : now.toISOString();
      out.scheduledRender = null;
      return out;
    }
    if (!was) {
      out.blogStatus = 'draft';
      out.publishAt = null;
      out.scheduledRender = null;
      return out;
    }
    for (const k of STATUS_FIELDS) {
      if (k in was) out[k] = was[k] as never;
      else delete out[k];
    }
    return out;
  });
  return { ...incoming, pages };
}

/** The published copy: the site without the articles that aren't live. */
export function withoutOfflineBlogs(state: CmsState): CmsState {
  if (!Array.isArray(state.pages)) return state;
  return { ...state, pages: state.pages.filter((p) => !isCmsBlogPage(p) || isLiveBlog(p)) };
}

/** The rendered pages that go on the website: none for an article that isn't live. */
export function liveRenderedPages<T extends { slug?: unknown }>(rendered: T[], state: CmsState): T[] {
  const offline = new Set<string>();
  for (const p of state.pages ?? []) {
    if (!isCmsBlogPage(p) || isLiveBlog(p)) continue;
    offline.add(normalizeCmsSlug(String(p.slug || '')));
    offline.add(toPublicBlogPath(String(p.slug || '')));
  }
  return rendered.filter((r) => !offline.has(normalizeCmsSlug(String(r?.slug || ''))));
}
