import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildLivePublishCss } from '@/lib/cms-publish-styles';
import { renderCmsPageHtml } from '@/lib/cms-render-html';
import {
  ensureCmsBlogPublicSlug,
  isCmsBlogPage,
  normalizeCmsSlug,
  toPublicBlogPath,
} from '@/lib/blog/cms-article-template';
import {
  DRAFT_KEY,
  PUBLISHED_KEY,
  RENDERED_KEY,
  parseCmsState,
  type CmsLoosePage,
  type ScheduledRenderPage,
} from '@/lib/blog/cms-blog-shared';

export {
  DRAFT_KEY,
  PUBLISHED_KEY,
  RENDERED_KEY,
  getBlogStatus,
  parseCmsState,
  type BlogPublishStatus,
  type CmsLoosePage,
  type ScheduledRenderPage,
} from '@/lib/blog/cms-blog-shared';

type RenderedDoc = { css?: string; pages?: ScheduledRenderPage[] };

function upsertKv(
  admin: ReturnType<typeof createAdminClient>,
  key: string,
  value: unknown,
  now: string,
) {
  return admin.from('cms_kv').upsert({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    updated_at: now,
  });
}

function findPageIndex(pages: CmsLoosePage[], id?: string, slug?: string): number {
  const wantSlug = slug ? normalizeCmsSlug(slug) : '';
  return pages.findIndex((p) => {
    if (id && String(p.id) === id) return true;
    if (wantSlug && normalizeCmsSlug(String(p.slug || '')) === wantSlug) return true;
    return false;
  });
}

function pageToPublishedCopy(pg: CmsLoosePage): CmsLoosePage {
  const copy = JSON.parse(JSON.stringify(pg)) as CmsLoosePage;
  copy.blogStatus = 'published';
  copy.publishAt = copy.publishAt || new Date().toISOString();
  delete copy.scheduledRender;
  return copy;
}

function mergeRenderedPage(rendered: RenderedDoc, page: ScheduledRenderPage): RenderedDoc {
  const pages = Array.isArray(rendered.pages) ? [...rendered.pages] : [];
  const want = normalizeCmsSlug(page.slug);
  const idx = pages.findIndex((p) => normalizeCmsSlug(String(p.slug || '')) === want);
  const entry = {
    slug: normalizeCmsSlug(page.slug),
    name: page.name,
    theme: page.theme || '',
    seo: page.seo || {},
    html: page.html,
  };
  if (idx >= 0) pages[idx] = entry;
  else pages.push(entry);
  return {
    css: rendered.css || buildLivePublishCss(),
    pages,
  };
}

async function resolveScheduleHtml(
  admin: ReturnType<typeof createAdminClient>,
  pg: CmsLoosePage,
  provided?: ScheduledRenderPage,
  images?: Array<{ id?: string; data?: string }>,
): Promise<ScheduledRenderPage> {
  const slug = normalizeCmsSlug(provided?.slug || String(pg.slug || ''));
  const name = provided?.name || String(pg.name || 'Article');
  const theme = provided?.theme || String(pg.theme || '');
  const seo = provided?.seo || (pg.seo as Record<string, unknown>) || {};

  if (provided?.html?.trim()) {
    return { slug, name, theme, seo, html: provided.html };
  }
  if (pg.scheduledRender?.html?.trim()) {
    return {
      slug,
      name: pg.scheduledRender.name || name,
      theme: pg.scheduledRender.theme || theme,
      seo: pg.scheduledRender.seo || seo,
      html: pg.scheduledRender.html,
    };
  }

  const { data: renData } = await admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle();
  if (renData?.value) {
    try {
      const rendered = JSON.parse(renData.value) as RenderedDoc;
      const hit = (rendered.pages || []).find((p) => normalizeCmsSlug(String(p.slug || '')) === slug);
      if (hit?.html?.trim()) {
        return {
          slug,
          name: hit.name || name,
          theme: hit.theme || theme,
          seo: hit.seo || seo,
          html: hit.html,
        };
      }
    } catch {
      /* ignore corrupt rendered */
    }
  }

  const html = renderCmsPageHtml(Array.isArray(pg.blocks) ? pg.blocks : [], images || []);
  if (!html.replace(/<[^>]+>/g, '').trim()) {
    throw new Error('Nothing to publish — add sections to this article first.');
  }
  return { slug, name, theme, seo, html };
}

/** Save schedule + capture of rendered HTML for later auto-publish. */
export async function scheduleCmsBlog(opts: {
  id?: string;
  slug?: string;
  publishAt: string;
  /** Optional — when omitted, HTML is built from the draft (or reused from a prior publish). */
  renderedPage?: Partial<ScheduledRenderPage>;
}) {
  const at = new Date(opts.publishAt);
  if (Number.isNaN(at.getTime())) throw new Error('Invalid schedule time');
  if (at.getTime() <= Date.now() + 30_000) {
    throw new Error('Schedule time must be at least 30 seconds in the future');
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (error) throw new Error(error.message);

  const state = parseCmsState(data?.value);
  const idx = findPageIndex(state.pages || [], opts.id, opts.slug);
  if (idx < 0) throw new Error('Blog page not found');
  const pg = state.pages![idx];
  if (!isCmsBlogPage(pg)) throw new Error('Not an AI blog page');
  ensureCmsBlogPublicSlug(pg);

  const images = Array.isArray((state as { site?: { images?: unknown } }).site?.images)
    ? ((state as { site: { images: Array<{ id?: string; data?: string }> } }).site.images)
    : [];
  const rendered = await resolveScheduleHtml(
    admin,
    pg,
    opts.renderedPage
      ? {
          slug: String(opts.renderedPage.slug || pg.slug || ''),
          name: String(opts.renderedPage.name || pg.name || 'Article'),
          theme: opts.renderedPage.theme,
          seo: opts.renderedPage.seo,
          html: String(opts.renderedPage.html || ''),
        }
      : undefined,
    images,
  );

  pg.blogStatus = 'scheduled';
  pg.publishAt = at.toISOString();
  pg.scheduledRender = rendered;

  const { error: upErr } = await upsertKv(admin, DRAFT_KEY, state, now);
  if (upErr) throw new Error(upErr.message);

  return {
    id: String(pg.id),
    slug: normalizeCmsSlug(String(pg.slug || '')),
    publishAt: pg.publishAt,
  };
}

export async function cancelCmsBlogSchedule(opts: { id?: string; slug?: string }) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [draftRes, renRes] = await Promise.all([
    admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle(),
    admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle(),
  ]);
  const failedRead = draftRes.error || renRes.error;
  if (failedRead) throw new Error(failedRead.message);

  const state = parseCmsState(draftRes.data?.value);
  const idx = findPageIndex(state.pages || [], opts.id, opts.slug);
  if (idx < 0) throw new Error('Blog page not found');
  const pg = state.pages![idx];

  // The every-minute job may have put it live since the Blog list was loaded. Unschedule only
  // changes the saved site, so it would say Draft while the website still shows the article.
  let rendered: RenderedDoc = { pages: [] };
  try {
    rendered = renRes.data?.value ? (JSON.parse(renRes.data.value) as RenderedDoc) : { pages: [] };
  } catch {
    rendered = { pages: [] };
  }
  const aliases = slugAliases(String(pg.slug || opts.slug || ''));
  const onWebsite = (rendered.pages || []).some((p) => pageMatchesBlog(p, undefined, aliases));
  if (String(pg.blogStatus || '').toLowerCase() === 'published' || onWebsite) {
    throw new Error(
      'This article has already gone live, so there’s no schedule to cancel. To take it off the website, click ⋯, then Unpublish.',
    );
  }

  pg.blogStatus = 'draft';
  pg.publishAt = null;
  pg.scheduledRender = null;

  const { error: upErr } = await upsertKv(admin, DRAFT_KEY, state, now);
  if (upErr) throw new Error(upErr.message);
  return { ok: true };
}

function slugAliases(raw: string): Set<string> {
  const n = normalizeCmsSlug(raw);
  const pub = toPublicBlogPath(raw);
  return new Set([n, pub, normalizeCmsSlug(pub)].filter(Boolean));
}

function pageMatchesBlog(
  p: { id?: string; slug?: string },
  id: string | undefined,
  aliases: Set<string>,
): boolean {
  if (id && String(p.id || '') === id) return true;
  const s = normalizeCmsSlug(String(p.slug || ''));
  return Boolean(s && (aliases.has(s) || aliases.has(toPublicBlogPath(s))));
}

/** Take a live AI blog offline — keep the draft, remove from published + rendered. */
export async function unpublishCmsBlog(opts: { id?: string; slug?: string }) {
  if (!opts.id && !opts.slug) throw new Error('id or slug is required');

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const [draftRes, pubRes, renRes] = await Promise.all([
    admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle(),
    admin.from('cms_kv').select('value').eq('key', PUBLISHED_KEY).maybeSingle(),
    admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle(),
  ]);
  // A doc that couldn't be read would be written back empty, taking every page with it.
  const failedRead = draftRes.error || pubRes.error || renRes.error;
  if (failedRead) throw new Error(failedRead.message);

  const draft = parseCmsState(draftRes.data?.value);
  const idx = findPageIndex(draft.pages || [], opts.id, opts.slug);
  if (idx < 0) throw new Error('Blog page not found');
  const pg = draft.pages![idx];
  if (!isCmsBlogPage(pg)) throw new Error('Not an AI blog page');

  const rawSlug = String(pg.slug || opts.slug || '');
  const publicSlug = toPublicBlogPath(rawSlug);
  const aliases = slugAliases(rawSlug);
  const id = String(pg.id || opts.id || '');

  pg.blogStatus = 'draft';
  pg.publishAt = null;
  pg.scheduledRender = null;

  const published = parseCmsState(pubRes.data?.value);
  if (Array.isArray(published.pages)) {
    published.pages = published.pages.filter((p) => !pageMatchesBlog(p, id, aliases));
  }

  let rendered: RenderedDoc = { css: '', pages: [] };
  try {
    rendered = renRes.data?.value
      ? (JSON.parse(renRes.data.value) as RenderedDoc)
      : { pages: [] };
  } catch {
    rendered = { pages: [] };
  }
  if (Array.isArray(rendered.pages)) {
    rendered.pages = rendered.pages.filter((p) => !pageMatchesBlog(p, undefined, aliases));
  }

  // One after another, each checked, in the reverse of the job's order: the saved site (Draft), then the
  // published copy, then the website's pages. If a write fails, the article is still on the website, so the
  // Blog list's Live is right and View opens it, and clicking Unpublish again finishes the job.
  for (const [key, value] of [
    [DRAFT_KEY, draft],
    [PUBLISHED_KEY, published],
    [RENDERED_KEY, rendered],
  ] as const) {
    const { error } = await upsertKv(admin, key, value, now);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/', 'layout');
  revalidatePath('/blog');
  revalidatePath(publicSlug);

  return { ok: true, slug: publicSlug };
}

/**
 * Publish all AI blogs whose publishAt has passed. Run every minute by the cron
 * (/api/cron/whatsapp-outbox) and by /api/cron/publish-scheduled-blogs; it reads the
 * published and rendered docs only when something is due, and running twice is harmless.
 */
export async function publishDueScheduledBlogs(now = new Date()) {
  const admin = createAdminClient();
  const nowIso = now.toISOString();

  const draftRes = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (draftRes.error) throw new Error(draftRes.error.message);
  const draft = parseCmsState(draftRes.data?.value);

  const due = (draft.pages || []).filter((p) => {
    if (!isCmsBlogPage(p)) return false;
    if (String(p.blogStatus || '').toLowerCase() !== 'scheduled') return false;
    if (!p.publishAt) return false;
    const at = new Date(String(p.publishAt));
    return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime();
  });

  if (!due.length) {
    return { published: 0, slugs: [] as string[] };
  }

  const [pubRes, renRes] = await Promise.all([
    admin.from('cms_kv').select('value').eq('key', PUBLISHED_KEY).maybeSingle(),
    admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle(),
  ]);
  const failedRead = pubRes.error || renRes.error;
  if (failedRead) throw new Error(failedRead.message);
  const published = parseCmsState(pubRes.data?.value);
  let rendered: RenderedDoc = { css: '', pages: [] };
  try {
    rendered = renRes.data?.value ? (JSON.parse(renRes.data.value) as RenderedDoc) : { pages: [] };
  } catch {
    rendered = { pages: [] };
  }
  if (!rendered.css) rendered.css = buildLivePublishCss();

  const publishedPages = [...(published.pages || [])];
  const slugs: string[] = [];

  for (const pg of due) {
    ensureCmsBlogPublicSlug(pg);
    const slug = toPublicBlogPath(String(pg.slug || ''));
    const render =
      pg.scheduledRender && pg.scheduledRender.html
        ? {
            slug,
            name: pg.scheduledRender.name || String(pg.name || 'Article'),
            theme: pg.scheduledRender.theme || String(pg.theme || ''),
            seo: pg.scheduledRender.seo || (pg.seo as Record<string, unknown>) || {},
            html: pg.scheduledRender.html,
          }
        : null;

    if (!render) {
      // Can't go live without captured HTML — leave scheduled so an admin can reschedule
      continue;
    }

    const pubCopy = pageToPublishedCopy(pg);
    const pIdx = publishedPages.findIndex(
      (p) => String(p.id) === String(pg.id) || normalizeCmsSlug(String(p.slug || '')) === slug,
    );
    if (pIdx >= 0) publishedPages[pIdx] = pubCopy;
    else publishedPages.push(pubCopy);

    rendered = mergeRenderedPage(rendered, render);

    pg.blogStatus = 'published';
    pg.publishAt = String(pg.publishAt || nowIso);
    pg.scheduledRender = null;
    slugs.push(slug);
  }

  if (!slugs.length) {
    return { published: 0, slugs: [] };
  }

  published.pages = publishedPages;

  // One after another, each checked: the website's pages, then the published copy (which the Blog list
  // also counts as Live), then the saved site (Live, captured page cleared). If a write fails, the article
  // is still Scheduled with its captured page and the next minute retries. It's never Live in the list
  // without being on the website, and once it's on the website Unschedule refuses it.
  for (const [key, value] of [
    [RENDERED_KEY, rendered],
    [PUBLISHED_KEY, published],
    [DRAFT_KEY, draft],
  ] as const) {
    const { error } = await upsertKv(admin, key, value, nowIso);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/', 'layout');
  revalidatePath('/blog');
  for (const slug of slugs) revalidatePath(slug);
  return { published: slugs.length, slugs };
}
