import { BLOG_CATEGORIES } from '@/data/blog-mock';
import {
  ensureCmsBlogPublicSlug,
  isCmsBlogPage,
  normalizeCmsSlug,
  publicBlogParam,
  toPublicBlogPath,
} from '@/lib/blog/cms-article-template';
import {
  DRAFT_KEY,
  PUBLISHED_KEY,
  RENDERED_KEY,
  getBlogStatus,
  parseCmsState,
  type CmsLoosePage,
} from '@/lib/blog/cms-blog-shared';
import type { BlogCategory, BlogPost } from '@/lib/blog/types';
import { estimateReadMinutes, isPostPublic } from '@/lib/blog/visibility';
import { createAdminClient } from '@/lib/supabase/admin';

const FALLBACK_IMAGE = {
  src: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1600&q=80',
  alt: 'Solar panels under blue sky',
};

type RenderedPage = {
  slug?: string;
  name?: string;
  theme?: string;
  seo?: { title?: string; desc?: string; noindex?: boolean };
  html?: string;
};

type RenderedDoc = { css?: string; pages?: RenderedPage[] };

type CmsBlock = { t?: string; p?: Record<string, unknown> };

function imgSrc(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val && 'src' in val) return String((val as { src?: string }).src || '');
  if (typeof val === 'object' && val && 'data' in val) return String((val as { data?: string }).data || '');
  return '';
}

function imgAlt(val: unknown): string {
  if (!val || typeof val !== 'object') return '';
  return String((val as { alt?: string }).alt || '');
}

function findBlock(pg: CmsLoosePage, type: string): CmsBlock | undefined {
  const blocks = Array.isArray(pg.blocks) ? (pg.blocks as CmsBlock[]) : [];
  return blocks.find((b) => String(b?.t || '') === type);
}

function plainFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapCategories(raw: string): BlogCategory[] {
  const tokens = raw
    .toLowerCase()
    .split(/[,|/]+|\band\b/)
    .map((t) => t.trim())
    .filter(Boolean);
  const hits: BlogCategory[] = [];
  for (const cat of BLOG_CATEGORIES) {
    if (tokens.some((t) => t === cat.slug || t.includes(cat.slug) || cat.title.toLowerCase() === t)) {
      hits.push(cat);
    }
  }
  if (!hits.length) {
    // soft match fragment
    for (const cat of BLOG_CATEGORIES) {
      if (raw.toLowerCase().includes(cat.slug) || raw.toLowerCase().includes(cat.title.toLowerCase())) {
        hits.push(cat);
      }
    }
  }
  return hits.length ? hits : [BLOG_CATEGORIES[0]!];
}

/** Card/list shape for a published CMS AI blog. */
export function cmsBlogToPublicPost(pg: CmsLoosePage): BlogPost {
  ensureCmsBlogPublicSlug(pg);
  const cmsSlug = toPublicBlogPath(String(pg.slug || ''));
  const hero = findBlock(pg, 'hero');
  const media = findBlock(pg, 'media');
  const seo = (pg.seo || {}) as { title?: string; desc?: string };
  const heroP = (hero?.p || {}) as Record<string, unknown>;
  const mediaP = (media?.p || {}) as Record<string, unknown>;

  const title =
    String(pg.name || '').trim() ||
    String(heroP.headline || '').trim() ||
    'Untitled article';
  const excerpt =
    String(seo.desc || '').trim() ||
    String(heroP.sub || '').trim() ||
    String(mediaP.text || '').trim().slice(0, 220) ||
    '';

  const mediaImg = mediaP.img;
  const src = imgSrc(mediaImg);
  const alt = imgAlt(mediaImg) || title;

  const tagRaw = String(heroP.eyebrow || heroP.tags || '').trim();
  const categories = mapCategories(tagRaw || 'solar');

  const statusRaw = getBlogStatus(pg, true);
  const status =
    statusRaw === 'scheduled' ? 'scheduled' : statusRaw === 'published' ? 'published' : 'published';

  const publishAt =
    (pg.publishAt && String(pg.publishAt)) || new Date().toISOString();

  const bodyText =
    (Array.isArray(pg.blocks) ? (pg.blocks as CmsBlock[]) : [])
      .map((b) => {
        const p = b.p || {};
        if (b.t === 'rich') return plainFromHtml(String(p.html || ''));
        if (b.t === 'hero') return [p.headline, p.sub].map(String).join(' ');
        if (b.t === 'media') return [p.title, p.text].map(String).join(' ');
        return '';
      })
      .join(' ').length || excerpt.length;

  const post: BlogPost = {
    id: String(pg.id || cmsSlug),
    title,
    slug: publicBlogParam(cmsSlug),
    excerpt: excerpt || title,
    body: [],
    mainImage: src ? { src, alt } : { ...FALLBACK_IMAGE },
    categories,
    author: 'Heliaxis',
    status,
    publishAt,
    seoTitle: seo.title ? String(seo.title) : undefined,
    seoDescription: seo.desc ? String(seo.desc) : undefined,
    ogImage: src || undefined,
    readMinutes: estimateReadMinutes(Math.max(bodyText, excerpt.length)),
  };

  return post;
}

function renderedSlugSet(pages: RenderedPage[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const p of pages || []) {
    const raw = normalizeCmsSlug(String(p.slug || ''));
    set.add(raw);
    set.add(toPublicBlogPath(raw));
  }
  return set;
}

function pageKey(pg: CmsLoosePage): string {
  return String(pg.id || '') || toPublicBlogPath(String(pg.slug || ''));
}

function mergeBlogCatalog(draft: CmsLoosePage[], published: CmsLoosePage[]): Map<string, CmsLoosePage> {
  const map = new Map<string, CmsLoosePage>();
  for (const p of [...published, ...draft]) {
    if (!isCmsBlogPage(p)) continue;
    const copy = JSON.parse(JSON.stringify(p)) as CmsLoosePage;
    ensureCmsBlogPublicSlug(copy);
    map.set(pageKey(copy), copy);
    map.set(toPublicBlogPath(String(copy.slug || '')), copy);
  }
  return map;
}

function isLiveBlog(pg: CmsLoosePage, rendered: Set<string>, now: Date): boolean {
  if (!isCmsBlogPage(pg)) return false;
  const slug = toPublicBlogPath(String(pg.slug || ''));
  const legacy = normalizeCmsSlug(String(pg.slug || ''));
  const live = rendered.has(slug) || rendered.has(legacy);
  if (!live) return false;
  const status = getBlogStatus(pg, true);
  if (status === 'scheduled') {
    const at = new Date(String(pg.publishAt || ''));
    if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) return false;
  }
  return true;
}

export type CmsBlogArticle = {
  post: BlogPost;
  cmsSlug: string;
  html: string;
  css: string;
  theme?: string;
  seo?: RenderedPage['seo'];
};

async function loadCmsBlogSources(): Promise<{
  catalog: Map<string, CmsLoosePage>;
  rendered: RenderedDoc;
  renderedSlugs: Set<string>;
} | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    const admin = createAdminClient();
    const [draftRes, pubRes, renRes] = await Promise.all([
      admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle(),
      admin.from('cms_kv').select('value').eq('key', PUBLISHED_KEY).maybeSingle(),
      admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle(),
    ]);
    const draft = parseCmsState(draftRes.data?.value);
    const published = parseCmsState(pubRes.data?.value);
    let rendered: RenderedDoc = { css: '', pages: [] };
    try {
      rendered = renRes.data?.value ? (JSON.parse(renRes.data.value) as RenderedDoc) : { pages: [] };
    } catch {
      rendered = { pages: [] };
    }
    return {
      catalog: mergeBlogCatalog(draft.pages || [], published.pages || []),
      rendered,
      renderedSlugs: renderedSlugSet(rendered.pages),
    };
  } catch {
    return null;
  }
}

/** Published CMS AI blogs as public BlogPost cards (empty if none live). */
export async function getCmsPublicPosts(): Promise<BlogPost[]> {
  const src = await loadCmsBlogSources();
  if (!src) return [];
  const now = new Date();
  const seen = new Set<string>();
  const posts: BlogPost[] = [];

  for (const pg of src.catalog.values()) {
    const cmsSlug = toPublicBlogPath(String(pg.slug || ''));
    if (seen.has(cmsSlug)) continue;
    if (!isLiveBlog(pg, src.renderedSlugs, now)) continue;
    seen.add(cmsSlug);
    const post = cmsBlogToPublicPost(pg);
    if (!isPostPublic(post, now) && post.status === 'scheduled') continue;
    // Live in rendered ⇒ treat as published for the journal
    posts.push({ ...post, status: 'published' });
  }

  return posts.sort(
    (a, b) => new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime(),
  );
}

export async function getCmsPublicPostBySlug(param: string): Promise<BlogPost | null> {
  const posts = await getCmsPublicPosts();
  const want = publicBlogParam(param);
  return posts.find((p) => p.slug === want) ?? null;
}

/** Full CMS HTML for `/blog/[slug]` article rendering. */
export async function getCmsBlogArticleBySlug(param: string): Promise<CmsBlogArticle | null> {
  const src = await loadCmsBlogSources();
  if (!src) return null;
  const now = new Date();
  const cmsSlug = toPublicBlogPath(param);
  const legacy = normalizeCmsSlug(param);

  const pg =
    src.catalog.get(cmsSlug) ||
    [...src.catalog.values()].find((p) => {
      const s = toPublicBlogPath(String(p.slug || ''));
      return s === cmsSlug || normalizeCmsSlug(String(p.slug || '')) === legacy;
    });
  if (!pg || !isLiveBlog(pg, src.renderedSlugs, now)) return null;

  const renderedPage =
    (src.rendered.pages || []).find((p) => toPublicBlogPath(String(p.slug || '')) === cmsSlug) ||
    (src.rendered.pages || []).find((p) => normalizeCmsSlug(String(p.slug || '')) === legacy);

  if (!renderedPage?.html?.trim()) return null;

  return {
    post: { ...cmsBlogToPublicPost(pg), status: 'published' },
    cmsSlug: toPublicBlogPath(String(pg.slug || cmsSlug)),
    html: renderedPage.html,
    css: src.rendered.css || '',
    theme: renderedPage.theme,
    seo: renderedPage.seo,
  };
}
