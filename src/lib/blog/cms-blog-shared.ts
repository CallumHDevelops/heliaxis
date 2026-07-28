/** Shared CMS blog KV helpers — safe for any Server Component (no next/cache). */

export const DRAFT_KEY = 'heliaxis-cms-v1';
export const PUBLISHED_KEY = 'heliaxis-cms-published';
export const RENDERED_KEY = 'heliaxis-cms-rendered';

export type BlogPublishStatus = 'draft' | 'scheduled' | 'published';

export type ScheduledRenderPage = {
  slug: string;
  name: string;
  theme?: string;
  seo?: Record<string, unknown>;
  html: string;
};

export type CmsLoosePage = {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  origin?: string;
  theme?: string;
  seo?: Record<string, unknown>;
  blocks?: unknown[];
  blogStatus?: BlogPublishStatus;
  publishAt?: string | null;
  scheduledRender?: ScheduledRenderPage | null;
  [key: string]: unknown;
};

export type CmsState = { pages?: CmsLoosePage[]; current?: number; [key: string]: unknown };

export function parseCmsState(raw: string | null | undefined): CmsState {
  if (!raw) return { pages: [] };
  try {
    const state = JSON.parse(raw) as CmsState;
    if (!Array.isArray(state.pages)) state.pages = [];
    return state;
  } catch {
    return { pages: [] };
  }
}

export function getBlogStatus(pg: CmsLoosePage, live: boolean): BlogPublishStatus {
  const s = String(pg.blogStatus || '').toLowerCase();
  if (s === 'scheduled' && pg.publishAt) {
    const at = new Date(String(pg.publishAt));
    if (!Number.isNaN(at.getTime()) && at.getTime() > Date.now()) return 'scheduled';
  }
  if (live || s === 'published') return 'published';
  if (s === 'scheduled') return 'scheduled';
  return 'draft';
}
