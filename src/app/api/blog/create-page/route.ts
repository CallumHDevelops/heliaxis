import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildCmsArticlePage,
  cmsArticleAiSchema,
  fillExampleBlogTemplate,
  findExampleBlogPage,
  isReservedCmsSlug,
  normalizeCmsSlug,
  placeholderCmsArticleAi,
  type CmsArticleAi,
} from '@/lib/blog/cms-article-template';

export const dynamic = 'force-dynamic';

const DRAFT_KEY = 'heliaxis-cms-v1';

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

function uniqueSlug(pages: Array<Record<string, unknown>>, base: string): string {
  let slug = normalizeCmsSlug(base);
  if (isReservedCmsSlug(slug)) {
    slug = normalizeCmsSlug(slug.replace(/^\/blog\/?/, '') || 'article');
    if (isReservedCmsSlug(slug)) slug = '/article';
  }
  if (!slugTaken(pages, slug)) return slug;
  let n = 2;
  while (slugTaken(pages, `${slug}-${n}`)) n++;
  return normalizeCmsSlug(`${slug.replace(/^\//, '')}-${n}`);
}

export async function POST(req: Request) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { draft?: unknown; placeholder?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let ai: CmsArticleAi;
  try {
    if (body.placeholder) {
      ai = placeholderCmsArticleAi();
      ai.title = 'Untitled article';
      ai.slug = 'untitled-article';
      ai.seoTitle = 'Untitled article — Heliaxis';
    } else {
      const raw = body.draft as Record<string, unknown>;
      if (raw && typeof raw.slug === 'string') {
        raw.slug = String(raw.slug).replace(/^\/+/, '');
      }
      ai = cmsArticleAiSchema.parse(raw);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid draft';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let state: CmsState;
  try {
    state = data?.value ? (JSON.parse(data.value) as CmsState) : { pages: [], current: 0, site: {} };
  } catch {
    return NextResponse.json({ error: 'CMS draft is corrupt' }, { status: 500 });
  }

  if (!Array.isArray(state.pages)) state.pages = [];

  const slug = uniqueSlug(state.pages, ai.slug);
  if (isReservedCmsSlug(slug)) {
    return NextResponse.json({ error: 'That slug is reserved' }, { status: 400 });
  }

  const aiForPage = { ...ai, slug: slug.replace(/^\//, '') };
  const example = findExampleBlogPage(state.pages);
  const page = example
    ? fillExampleBlogTemplate(example, aiForPage)
    : buildCmsArticlePage(aiForPage);
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
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const editPath = `/admin${slug === '/' ? '' : slug}`;
  // Prefer title-based admin path (matches cms-engine pageEditSlug)
  const editSlug = String(page.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || slug.replace(/^\//, '');
  const adminEditPath = `/admin/${editSlug}`;
  return NextResponse.json({
    ok: true,
    id: page.id,
    name: page.name,
    slug,
    editPath: adminEditPath || editPath,
  });
}
