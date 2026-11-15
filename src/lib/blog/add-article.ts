import {
  buildCmsArticlePage,
  fillExampleBlogTemplate,
  findExampleBlogPage,
  isReservedCmsSlug,
  normalizeCmsSlug,
  publicBlogParam,
  toPublicBlogPath,
  type CmsArticleAi,
} from '@/lib/blog/cms-article-template';
import { resolveUnsplashBlogImage } from '@/lib/blog/unsplash-image';

export type CmsPages = Array<Record<string, unknown>>;

export const slugTaken = (pages: CmsPages, slug: string): boolean => {
  const want = normalizeCmsSlug(slug);
  return pages.some((p) => normalizeCmsSlug(String(p.slug || '')) === want);
};

/** A /blog/<slug> path that no page uses yet (a number is added if the slug is taken). */
export function uniqueBlogSlug(pages: CmsPages, base: string): string {
  let slug = toPublicBlogPath(base);
  if (isReservedCmsSlug(slug) || slug === '/blog') slug = toPublicBlogPath('article');
  if (!slugTaken(pages, slug)) return slug;
  let n = 2;
  const stem = slug.replace(/\/$/, '');
  while (slugTaken(pages, `${stem}-${n}`)) n++;
  return toPublicBlogPath(`${stem}-${n}`);
}

/**
 * An article written for the fixed blog template, added to the CMS draft as a new page (not published: it is a draft until someone
 * schedules or publishes it from the CMS). Returns the page and its public path. The picture is looked up from `imageQuery`.
 */
export async function addArticleToState(pages: CmsPages, ai: CmsArticleAi): Promise<{ page: Record<string, unknown>; slug: string }> {
  const slug = uniqueBlogSlug(pages, ai.slug);
  if (isReservedCmsSlug(slug)) throw new Error('That slug is reserved');
  const aiForPage = { ...ai, slug: publicBlogParam(slug) };
  const topic = [ai.title, ai.tags, ai.headline, ai.introTitle, ai.introText, ai.seoDescription].filter(Boolean).join(' ');
  const mediaImg = await resolveUnsplashBlogImage({ imageQuery: ai.imageQuery, topic });
  const example = findExampleBlogPage(pages);
  const page = example ? fillExampleBlogTemplate(example, aiForPage, { mediaImg }) : buildCmsArticlePage(aiForPage, { mediaImg });
  page.slug = slug;
  page.seo = { ...page.seo, slug };
  page.type = 'blog';
  (page as { origin?: string }).origin = 'ai-blog';
  pages.push(page);
  return { page, slug };
}
