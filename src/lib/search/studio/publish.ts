import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderCmsPageHtml } from '@/lib/cms-render-html';
import { buildLivePublishCss } from '@/lib/cms-publish-styles';
import { DRAFT_KEY, PUBLISHED_KEY, RENDERED_KEY, parseCmsState, type CmsLoosePage } from '@/lib/blog/cms-blog-shared';
import { buildCmsArticlePage, cmsArticleAiSchema, fillExampleBlogTemplate, findExampleBlogPage, normalizeCmsSlug, publicBlogParam, toPublicBlogPath, type CmsArticleAi } from '@/lib/blog/cms-article-template';
import { addArticleToState, uniqueBlogSlug, type CmsPages } from '@/lib/blog/add-article';
import { publishOneBlogInState, type RenderedDoc } from '@/lib/blog/publish-one';
import { casCmsKv, type KvDb } from '@/lib/cms-kv-cas';
import { getCmsRendered, findCmsPage } from '@/lib/cms-rendered';
import { clearAction } from '@/lib/search/inbox';
import type { SearchSession } from '@/lib/search/server';
import { canPublish, limitCheck } from './checks';
import { checkContent, contentRules, getContent, newPagesThisWeek, site, type Db, type PublishInfo } from './server';
import { recordMeasure } from './measure-job';
import { normPath } from './text';
import { publicPath } from './writer';
import { claimedAhead, PUBLISH_LOCK_MS, publishInFlight } from './publish-lock';
import type { Brief, Draft } from './types';

/**
 * Approve and publish (spec §5 M4.5). Only an admin or the owner, only from review, only with fresh passing checks and
 * room under the weekly limit. Pages are written into the website editor's draft, published and rendered snapshots (the
 * sitemap reads the rendered one); articles are built with the blog code and only that article is published. Every
 * write to the CMS documents is compare-and-swap on cms_kv.updated_at, so a website-editor save at the same moment is
 * never overwritten (and the editor routes keep studio pages a stale tab lacks: src/lib/cms-studio-merge.ts). Then
 * IndexNow, and a day-0 baseline.
 */

const KEYS = [DRAFT_KEY, PUBLISHED_KEY, RENDERED_KEY];

function parseRendered(raw: string | null): RenderedDoc {
  try {
    const r = raw ? (JSON.parse(raw) as RenderedDoc) : { pages: [] };
    return r && typeof r === 'object' ? { ...r, pages: Array.isArray(r.pages) ? r.pages : [] } : { pages: [] };
  } catch {
    return { pages: [] };
  }
}

const sameSlug = (a: unknown, b: string) => normalizeCmsSlug(String(a || '')) === normalizeCmsSlug(b);

/** A website page: added (or replaced, for the same studio page) in the draft and published snapshots, and rendered. */
export async function publishCmsPage(contentId: number, draft: Draft, db: Db): Promise<string> {
  const path = publicPath('cms_page', draft.slug);
  await casCmsKv(db as unknown as KvDb, KEYS, async (v) => {
    const state = parseCmsState(v[DRAFT_KEY]);
    const published = parseCmsState(v[PUBLISHED_KEY]);
    let rendered = parseRendered(v[RENDERED_KEY]);
    const pages = state.pages ?? [];
    const clash = pages.find((p) => sameSlug(p.slug, path) && p.contentId !== contentId);
    if (clash || (rendered.pages ?? []).some((p) => sameSlug(p.slug, path) && !pages.some((x) => sameSlug(x.slug, path) && x.contentId === contentId))) {
      throw new Error(`${path} is already a page on the site. Change the slug.`);
    }
    // The site's footer, copied from an existing page, so the new page ends like the others.
    const footer = pages.flatMap((p) => (Array.isArray(p.blocks) ? (p.blocks as { t?: string }[]) : [])).find((b) => b?.t === 'footer');
    const blocks = [...(draft.blocks ?? []), ...(footer ? [{ ...JSON.parse(JSON.stringify(footer)), id: `f${contentId}` }] : [])];
    const seo = { slug: path, title: draft.title, desc: draft.description, jsonLd: draft.schema };
    const page: CmsLoosePage = { id: `search-${contentId}`, name: draft.title.replace(/\s*[|–—]\s*Heliaxis.*$/i, ''), slug: path, type: 'page', origin: 'search-studio', contentId, seo, blocks };
    const put = (list: CmsLoosePage[]) => {
      const i = list.findIndex((p) => p.contentId === contentId || sameSlug(p.slug, path));
      if (i >= 0) list[i] = JSON.parse(JSON.stringify(page));
      else list.push(JSON.parse(JSON.stringify(page)));
      return list;
    };
    state.pages = put(pages);
    published.pages = put(published.pages ?? []);
    const images = Array.isArray((state as { site?: { images?: unknown } }).site?.images) ? ((state as { site: { images: { id?: string; data?: string }[] } }).site.images) : [];
    const html = renderCmsPageHtml(blocks, images);
    const rpages = (rendered.pages ?? []).filter((p) => !sameSlug(p.slug, path));
    rpages.push({ slug: normalizeCmsSlug(path), name: page.name as string, theme: '', seo, html });
    rendered = { css: rendered.css || buildLivePublishCss(), pages: rpages };
    return { writes: { [DRAFT_KEY]: state, [PUBLISHED_KEY]: published, [RENDERED_KEY]: rendered }, result: null };
  });
  revalidatePath(path);
  return path;
}

/** The current approved draft written over an article the studio added earlier (a retried publish), keeping its id. */
function applyArticle(page: CmsLoosePage, ai: CmsArticleAi, slug: string, pages: CmsPages, schema: string) {
  const blocks = Array.isArray(page.blocks) ? (page.blocks as { t?: string; p?: { img?: unknown } }[]) : [];
  const img = blocks.find((b) => b?.t === 'media')?.p?.img;
  const mediaImg = img && (typeof img === 'string' || typeof img === 'object') ? (img as Record<string, unknown> | string) : undefined;
  const aiForPage = { ...ai, slug: publicBlogParam(slug) };
  const example = findExampleBlogPage(pages);
  const fresh = example ? fillExampleBlogTemplate(example, aiForPage, { pageId: String(page.id), mediaImg }) : buildCmsArticlePage(aiForPage, { pageId: String(page.id), mediaImg });
  page.name = fresh.name;
  page.theme = fresh.theme;
  page.blocks = fresh.blocks;
  page.slug = slug;
  page.seo = { ...(page.seo ?? {}), ...fresh.seo, slug, jsonLd: schema };
}

/**
 * An article, through the blog template: added to the CMS draft (or, on a retry, the existing one overwritten with the
 * current approved draft), then that one article published. The slug avoids every page in the draft, published and
 * rendered documents.
 */
export async function publishBlog(contentId: number, draft: Draft, db: Db): Promise<string> {
  const parsed = cmsArticleAiSchema.safeParse({ ...(draft.article ?? {}), slug: draft.slug, seoTitle: draft.title, seoDescription: draft.description });
  if (!parsed.success) throw new Error(`The article does not fit the blog template: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const ai = parsed.data;
  const path = await casCmsKv(db as unknown as KvDb, KEYS, async (v) => {
    const state = parseCmsState(v[DRAFT_KEY]);
    const published = parseCmsState(v[PUBLISHED_KEY]);
    const rendered = parseRendered(v[RENDERED_KEY]);
    state.pages = state.pages ?? [];
    const existing = state.pages.find((p) => p.contentId === contentId);
    const oldSlug = existing ? toPublicBlogPath(String(existing.slug || '')) : null;
    // Every address in use, except this article's own.
    const taken = [
      ...state.pages.filter((p) => p !== existing),
      ...(published.pages ?? []).filter((p) => !existing || String(p.id) !== String(existing.id)),
      ...(rendered.pages ?? []).filter((p) => !oldSlug || !sameSlug(p.slug, oldSlug)),
    ] as CmsPages;
    const slug = uniqueBlogSlug(taken, ai.slug);
    let page: CmsLoosePage;
    if (existing) {
      applyArticle(existing, ai, slug, state.pages as CmsPages, draft.schema);
      page = existing;
      if (oldSlug && oldSlug !== slug) {
        // Moved: take the old address down too.
        published.pages = (published.pages ?? []).filter((p) => String(p.id) !== String(existing.id));
        rendered.pages = (rendered.pages ?? []).filter((p) => !sameSlug(p.slug, oldSlug));
      }
    } else {
      const added = await addArticleToState(state.pages as CmsPages, { ...ai, slug: publicBlogParam(slug) });
      page = added.page as CmsLoosePage;
      page.contentId = contentId;
      page.searchStudio = true;
      page.seo = { ...(page.seo as Record<string, unknown>), jsonLd: draft.schema };
    }
    const out = publishOneBlogInState({ draft: state, published, rendered, id: String(page.id), nowIso: new Date().toISOString(), css: buildLivePublishCss });
    return { writes: { [DRAFT_KEY]: state, [PUBLISHED_KEY]: published, [RENDERED_KEY]: out.rendered }, result: out.slug };
  });
  revalidatePath('/', 'layout');
  revalidatePath('/blog');
  revalidatePath(path);
  return normPath(path);
}

/** Tells Bing (and the other IndexNow engines) the URL changed. Needs INDEXNOW_KEY and the key file at /<key>.txt. */
export async function pingIndexNow(urls: string[]): Promise<string> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return 'Not sent: INDEXNOW_KEY is not set.';
  const base = site();
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/${key}.txt`, urlList: urls }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? `Sent (${res.status}).` : `IndexNow answered ${res.status}.`;
  } catch (e) {
    return `Not sent: ${e instanceof Error ? e.message : 'network error'}.`;
  }
}

export async function approveAndPublish(id: number, s: SearchSession, db: Db = createAdminClient()): Promise<PublishInfo> {
  const before = await getContent(id, db);
  if (before.mode === 'refresh') throw new Error('A refresh is edited in the website editor; record it instead.');
  const busy = publishInFlight(before, Date.now());
  if (busy) throw new Error(busy);
  const checks = await checkContent(id, db);
  const gate = canPublish(before, s.role, checks);
  if (!gate.ok) throw new Error(gate.why);
  const now = new Date().toISOString();

  // Claim the row before anything else: from review to approved, or (a retry after a failed publish) approved with the
  // same approval time as read. Of two admins pressing Approve at once, exactly one gets the row.
  let claim = db.from('seo_content').update({ status: 'approved', approved_by: s.name, approved_at: now, updated_at: now }).eq('id', id).eq('status', before.status);
  if (before.status === 'approved') claim = before.approved_at ? claim.eq('approved_at', before.approved_at) : claim.is('approved_at', null);
  const { data: claimed, error: claimErr } = await claim.select('id');
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) throw new Error('Someone else is approving or publishing this page right now. Reload to see where it is.');
  const release = async () => {
    await db.from('seo_content').update({ status: before.status, approved_by: before.approved_by, approved_at: before.approved_at, updated_at: new Date().toISOString() }).eq('id', id).eq('approved_at', now);
  };

  // The draft published is the one that was checked: if it changed in between, stop.
  const cur = await getContent(id, db);
  if (JSON.stringify(cur.draft) !== JSON.stringify(before.draft)) {
    await release();
    throw new Error('The draft changed while it was being approved. Run the checks again.');
  }

  // The weekly limit, counted after the claim: pages published this week plus pages claimed just before this one.
  const rules = await contentRules(db);
  const since = new Date(Date.now() - PUBLISH_LOCK_MS * 2).toISOString();
  const [publishedThisWeek, { data: inFlight }] = await Promise.all([
    newPagesThisWeek(db, id),
    db.from('seo_content').select('id, approved_at').eq('mode', 'new').eq('status', 'approved').neq('id', id).gte('approved_at', since),
  ]);
  const used = publishedThisWeek + claimedAhead({ id, approvedAt: now }, (inFlight ?? []) as { id: number; approved_at: string | null }[]);
  if (!limitCheck('new', used, rules.weeklyNewPages).ok) {
    await release();
    throw new Error(`Weekly new-page limit: ${used} of ${rules.weeklyNewPages} new pages are published or being published this week.`);
  }

  const draft = cur.draft as Draft;
  let path: string;
  try {
    path = before.kind === 'blog' ? await publishBlog(id, draft, db) : await publishCmsPage(id, draft, db);
  } catch (e) {
    // Approved but not live: the admin can try again once the problem is fixed.
    await db.from('seo_content').update({ checks: { ...checks, error: `Publishing failed: ${e instanceof Error ? e.message : 'unknown error'}` } }).eq('id', id);
    throw e;
  }
  revalidatePath('/sitemap.xml');
  const url = `${site()}${path}`;
  const rendered = await getCmsRendered().catch(() => null);
  const inSitemap = !!findCmsPage(rendered, path)?.html;
  const indexNow = await pingIndexNow([url]);
  const info: PublishInfo = { path, url, at: now, by: s.name, inSitemap, indexNow };
  await db.from('seo_content').update({ status: 'published', published_ref: path, published_at: now, slug: path, checks: { ...checks, published: info }, updated_at: now }).eq('id', id);
  await afterPublish(db, { ...before, published_ref: path, published_at: now }, path);
  return info;
}

/** Refresh mode: the edits were made in the website editor; restart the measures from today. Admins only. */
export async function recordRefresh(id: number, s: SearchSession, db: Db = createAdminClient()): Promise<PublishInfo> {
  if (s.role !== 'owner' && s.role !== 'admin') throw new Error('Only an admin or the owner can record a refresh.');
  const c = await getContent(id, db);
  if (c.mode !== 'refresh') throw new Error('This is a new page, not a refresh.');
  if (c.status === 'published') throw new Error('Already recorded.');
  const path = normPath(c.slug ?? '');
  const checks = await checkContent(id, db);
  const now = new Date().toISOString();
  const url = `${site()}${path}`;
  const indexNow = await pingIndexNow([url]);
  const info: PublishInfo = { path, url, at: now, by: s.name, inSitemap: true, indexNow };
  await db.from('seo_content').update({ status: 'published', approved_by: s.name, approved_at: now, published_ref: path, published_at: now, checks: { ...checks, published: info }, updated_at: now }).eq('id', id);
  await afterPublish(db, { ...c, published_ref: path, published_at: now }, path);
  return info;
}

async function afterPublish(db: Db, c: Awaited<ReturnType<typeof getContent>>, path: string) {
  await clearAction('approval', `content:${c.id}`, db);
  await clearAction('refresh', `page:${path}`, db);
  const brief = c.brief as Brief;
  if (c.cluster_id) await db.from('seo_cluster').update({ status: 'published', target_page: path, action: 'improve', updated_at: new Date().toISOString() }).eq('id', c.cluster_id);
  const ids = brief?.target?.keywordIds ?? [];
  if (ids.length) await db.from('seo_keyword').update({ target_page: path }).in('id', ids).is('target_page', null);
  await recordMeasure(db, { id: c.id, published_at: c.published_at as string, published_ref: path, brief }, 0);
}
