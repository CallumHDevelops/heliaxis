import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
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
import { DRAFT_KEY } from '@/lib/blog/cms-blog-shared';

type CmsState = {
  pages?: Array<Record<string, unknown>>;
  current?: number;
  site?: unknown;
  [key: string]: unknown;
};

function slugTaken(pages: Array<Record<string, unknown>>, slug: string, exceptId?: string): boolean {
  const want = normalizeCmsSlug(slug);
  return pages.some((p) => {
    if (exceptId && p.id === exceptId) return false;
    const s = normalizeCmsSlug(String(p.slug || ''));
    return s === want;
  });
}

function uniqueBlogSlug(pages: Array<Record<string, unknown>>, base: string): string {
  let slug = toPublicBlogPath(base);
  if (isReservedCmsSlug(slug) || slug === '/blog') {
    slug = toPublicBlogPath('article');
  }
  if (!slugTaken(pages, slug)) return slug;
  let n = 2;
  const stem = slug.replace(/\/$/, '');
  while (slugTaken(pages, `${stem}-${n}`)) n++;
  // Keep `/blog/{slug}` structure — never let uniqueness turn it into `/blog-{slug}-N`.
  return toPublicBlogPath(`${stem}-${n}`);
}

export type BlogDraftResult = { id: unknown; name: unknown; slug: string; editPath: string };

/**
 * Add an AI article to the CMS draft as an unpublished blog page (from /admin/blog's generator and
 * the GEO bot). Throws a plain message on failure.
 */
export async function addBlogDraft(ai: CmsArticleAi): Promise<BlogDraftResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (error) throw new Error(error.message);

  let state: CmsState;
  try {
    state = data?.value ? (JSON.parse(data.value) as CmsState) : { pages: [], current: 0, site: {} };
  } catch {
    throw new Error('CMS draft is corrupt');
  }

  if (!Array.isArray(state.pages)) state.pages = [];

  const slug = uniqueBlogSlug(state.pages, ai.slug);
  if (isReservedCmsSlug(slug)) throw new Error('That slug is reserved');

  const aiForPage = { ...ai, slug: publicBlogParam(slug) };
  const topic = [ai.title, ai.tags, ai.headline, ai.introTitle, ai.introText, ai.seoDescription]
    .filter(Boolean)
    .join(' ');
  const mediaImg = await resolveUnsplashBlogImage({
    imageQuery: ai.imageQuery,
    topic,
  });
  const example = findExampleBlogPage(state.pages);
  const page = example
    ? fillExampleBlogTemplate(example, aiForPage, { mediaImg })
    : buildCmsArticlePage(aiForPage, { mediaImg });
  page.slug = slug;
  page.seo = { ...page.seo, slug };
  page.type = 'blog';
  (page as { origin?: string }).origin = 'ai-blog';
  state.pages.push(page);
  state.current = state.pages.length - 1;

  const { error: upErr } = await admin.from('cms_kv').upsert({
    key: DRAFT_KEY,
    value: JSON.stringify(state),
    updated_at: new Date().toISOString(),
  });
  if (upErr) throw new Error(upErr.message);

  const editPath = `/admin/cms${slug === '/' ? '' : slug}`;
  // Prefer title-based admin path (matches cms-engine pageEditSlug)
  const editSlug =
    String(page.name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || slug.replace(/^\//, '');
  const adminEditPath = `/admin/cms/${encodeURIComponent(editSlug)}`;
  return { id: page.id, name: page.name, slug, editPath: adminEditPath || editPath };
}
