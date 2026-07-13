import { createAdminClient } from '@/lib/supabase/admin';
import { isCmsBlogPage, normalizeCmsSlug } from '@/lib/blog/cms-article-template';
import {
  DRAFT_KEY,
  PUBLISHED_KEY,
  RENDERED_KEY,
  getBlogStatus,
  parseCmsState,
  type BlogPublishStatus,
} from '@/lib/blog/cms-blog-schedule';

export type CmsAiBlogListItem = {
  id: string;
  name: string;
  slug: string;
  editSlug: string;
  editPath: string;
  livePath: string;
  live: boolean;
  status: BlogPublishStatus;
  publishAt: string | null;
  sections: number;
};

type LoosePage = {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  origin?: string;
  blocks?: unknown[];
  blogStatus?: string;
  publishAt?: string | null;
};

/** Same rules as cms-engine pageEditSlug — admin URLs use the title slug. */
export function cmsAdminEditSlug(name: string, pageSlug: string): string {
  const fromName = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (fromName) return fromName;
  const fromSlug = String(pageSlug || '')
    .replace(/^\/+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return fromSlug || 'page';
}

function publishedSlugSet(pages: LoosePage[], renderedSlugs: string[]): Set<string> {
  const set = new Set<string>();
  for (const p of pages) {
    if (!isCmsBlogPage(p)) continue;
    set.add(normalizeCmsSlug(String(p.slug || '')));
  }
  for (const s of renderedSlugs) set.add(normalizeCmsSlug(s));
  return set;
}

/** List AI CMS blog pages from draft; mark live if present in published snapshot. */
export async function listCmsAiBlogs(): Promise<CmsAiBlogListItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const admin = createAdminClient();
  const [draftRes, pubRes, renderedRes] = await Promise.all([
    admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle(),
    admin.from('cms_kv').select('value').eq('key', PUBLISHED_KEY).maybeSingle(),
    admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle(),
  ]);

  const draft = parseCmsState(draftRes.data?.value);
  const published = parseCmsState(pubRes.data?.value);

  let renderedSlugs: string[] = [];
  try {
    const rendered = renderedRes.data?.value ? JSON.parse(renderedRes.data.value) : null;
    if (Array.isArray(rendered?.pages)) {
      renderedSlugs = rendered.pages.map((p: { slug?: string }) => String(p.slug || ''));
    }
  } catch {
    renderedSlugs = [];
  }

  const liveSlugs = publishedSlugSet(published.pages || [], renderedSlugs);

  return (draft.pages || [])
    .filter((p) => isCmsBlogPage(p))
    .map((p) => {
      const slug = normalizeCmsSlug(String(p.slug || ''));
      const editSlug = cmsAdminEditSlug(String(p.name || ''), slug);
      const live = liveSlugs.has(slug) || String(p.blogStatus || '').toLowerCase() === 'published';
      const status = getBlogStatus(p, live);
      return {
        id: String(p.id || slug),
        name: String(p.name || 'Untitled article'),
        slug,
        editSlug,
        editPath: `/admin/${encodeURIComponent(editSlug)}`,
        livePath: slug === '/' ? '/' : slug,
        live,
        status,
        publishAt: p.publishAt ? String(p.publishAt) : null,
        sections: Array.isArray(p.blocks) ? p.blocks.length : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
