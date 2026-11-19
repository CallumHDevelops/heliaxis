import { renderCmsPageHtml } from '@/lib/cms-render-html';
import { ensureCmsBlogPublicSlug, normalizeCmsSlug, toPublicBlogPath } from '@/lib/blog/cms-article-template';
import type { CmsState, ScheduledRenderPage } from '@/lib/blog/cms-blog-shared';

export type RenderedDoc = { css?: string; pages?: ScheduledRenderPage[] };

/**
 * Publishes ONE article now, in memory, the same way publishDueScheduledBlogs does for a due article: the draft page is
 * marked published, a copy goes into the published snapshot and its HTML into the rendered one. No other article is
 * touched (unlike publishDueScheduledBlogs, which publishes everything due). The caller writes the three documents.
 */
export function publishOneBlogInState(opts: {
  draft: CmsState;
  published: CmsState;
  rendered: RenderedDoc;
  id: string;
  nowIso: string;
  css: () => string;
}): { slug: string; rendered: RenderedDoc } {
  const pages = opts.draft.pages ?? [];
  const pg = pages.find((p) => String(p.id) === opts.id);
  if (!pg) throw new Error('Blog page not found');
  ensureCmsBlogPublicSlug(pg);
  const slug = toPublicBlogPath(String(pg.slug || ''));
  const images = Array.isArray((opts.draft as { site?: { images?: unknown } }).site?.images) ? (opts.draft as { site: { images: { id?: string; data?: string }[] } }).site.images : [];
  const html = renderCmsPageHtml(Array.isArray(pg.blocks) ? pg.blocks : [], images);
  if (!html.replace(/<[^>]+>/g, '').trim()) throw new Error('Nothing to publish: the article has no sections.');

  pg.blogStatus = 'published';
  pg.publishAt = String(pg.publishAt || opts.nowIso);
  pg.scheduledRender = null;

  const copy = JSON.parse(JSON.stringify(pg)) as typeof pg;
  delete copy.scheduledRender;
  const list = [...(opts.published.pages ?? [])];
  const i = list.findIndex((p) => String(p.id) === opts.id || normalizeCmsSlug(String(p.slug || '')) === slug);
  if (i >= 0) list[i] = copy;
  else list.push(copy);
  opts.published.pages = list;

  const rpages = [...(opts.rendered.pages ?? [])];
  const entry: ScheduledRenderPage = { slug: normalizeCmsSlug(slug), name: String(pg.name || 'Article'), theme: String(pg.theme || ''), seo: (pg.seo as Record<string, unknown>) || {}, html };
  const r = rpages.findIndex((p) => normalizeCmsSlug(String(p.slug || '')) === entry.slug);
  if (r >= 0) rpages[r] = entry;
  else rpages.push(entry);
  return { slug, rendered: { css: opts.rendered.css || opts.css(), pages: rpages } };
}
