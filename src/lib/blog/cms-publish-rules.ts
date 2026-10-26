/**
 * What a CMS save or Publish may change about blog articles and draft pages. Safe for any server code (no next/cache).
 *
 * An article's status (Draft, Scheduled, Live) is the server's: Schedule, Unschedule, Unpublish, the
 * scheduled-publish job and publishing that one article change it. An editor tab saves and publishes the
 * whole site, and a tab opened before an article was scheduled or taken down still has the old status, so
 * each article keeps the status the server has (one the server doesn't have is a draft), except the one
 * being published, which goes live now. Only live articles are in the published copy and on the website.
 *
 * A page's draft flag (`_draft`) is the server's too: only publishing that page clears it. A tab opened while
 * a page was still a draft keeps the flag after another tab publishes it, so each page keeps the flag the
 * server has (one the server doesn't have keeps the tab's), except the one being published and one that's on
 * the website now, which are live. Draft pages aren't on the website.
 */
import { isCmsBlogPage, normalizeCmsSlug, toPublicBlogPath } from './cms-article-template';
import type { CmsLoosePage, CmsState } from './cms-blog-shared';

const STATUS_FIELDS = ['blogStatus', 'publishAt', 'scheduledRender'] as const;

/** A page as Publish renders it: doPublish sends each with its page's id. */
type RenderedEntry = { id?: unknown; slug?: unknown };

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

/**
 * The site as an editor tab sent it, with each page's draft flag as the server has it. `publishPageId` goes live
 * now, and so does a page on the website already (`onSite`, the rendered pages; one rendered before they
 * carried ids, by its address), so Publish never takes a live page off.
 */
export function keepServerPageDraft(incoming: CmsState, server: CmsState, publishPageId: string | null, onSite: RenderedEntry[] = []): CmsState {
  if (!incoming || !Array.isArray(incoming.pages)) return incoming;
  const saved = new Map((server.pages ?? []).filter((p) => !isCmsBlogPage(p) && p.id).map((p) => [String(p.id), p]));
  const siteIds = new Set(onSite.filter((r) => r?.id).map((r) => String(r.id)));
  const siteSlugs = new Set(onSite.filter((r) => r && !r.id).map((r) => String(r.slug ?? '')));
  const pages = incoming.pages.map((pg) => {
    if (isCmsBlogPage(pg)) return pg;
    const id = pg.id ? String(pg.id) : '';
    const was = id ? saved.get(id) : undefined;
    const live = (!!id && (id === publishPageId || siteIds.has(id))) || siteSlugs.has(String(pg.slug ?? ''));
    const draft = live ? undefined : was ? was._draft : pg._draft;
    if (!!pg._draft === !!draft) return pg;
    const out: CmsLoosePage = { ...pg };
    if (draft) out._draft = draft;
    else delete out._draft;
    return out;
  });
  return { ...incoming, pages };
}

/** The published copy: the site without the articles that aren't live. */
export function withoutOfflineBlogs(state: CmsState): CmsState {
  if (!Array.isArray(state.pages)) return state;
  return { ...state, pages: state.pages.filter((p) => !isCmsBlogPage(p) || isLiveBlog(p)) };
}

/** The rendered pages that go on the website: none for an article that isn't live or a draft page (by its id). */
export function liveRenderedPages<T extends RenderedEntry>(rendered: T[], state: CmsState): T[] {
  const offline = new Set<string>();
  const drafts = new Set<string>();
  for (const p of state.pages ?? []) {
    if (!isCmsBlogPage(p)) {
      if (p._draft && p.id) drafts.add(String(p.id));
      continue;
    }
    if (isLiveBlog(p)) continue;
    offline.add(normalizeCmsSlug(String(p.slug || '')));
    offline.add(toPublicBlogPath(String(p.slug || '')));
  }
  return rendered.filter((r) => !offline.has(normalizeCmsSlug(String(r?.slug || ''))) && !(r?.id && drafts.has(String(r.id))));
}
