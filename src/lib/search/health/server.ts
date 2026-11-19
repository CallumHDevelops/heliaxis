import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfs, dfsConfigured } from '@/lib/dataforseo/client';
import { getCmsRendered } from '@/lib/cms-rendered';
import { getCmsPublicPosts } from '@/lib/blog/cms-public';
import { readProposals, recentAudits, siteBase } from '@/lib/seo/server';
import { CRAWLERS, robotsBlocks } from '../checklist';
import { gscConfigured, gscFetch, gscSite } from '../gsc';
import { clearAction, raiseAction } from '../inbox';
import { addDays, ukClock } from '../schedule';
import { checkCap } from '../server';
import {
  canonicalProblems,
  healthSummary,
  keyPages,
  latestByCheck,
  LIGHTHOUSE_COST,
  llmsVerdict,
  orphanPages,
  readInspection,
  readLighthouse,
  schemaVerdict,
  sitemapCoverage,
  sitemapLocs,
  sitemapStatus,
  type GscSitemap,
  type HealthCheck,
  type HealthRow,
  type Inspection,
} from './checks';

/**
 * M7 technical health (spec §5 M7), stored one row per check, page and day in seo_health. Two jobs:
 * - runHealthChecks: weekly, Monday after the site audit. The free checks (sitemap, orphans, canonicals, schema, crawler
 *   access, llms.txt) once a day at most, then a few paid mobile Lighthouse runs per call (monthly per page, under the cap).
 * - runIndexChecks: daily, the 50 most important URLs through Search Console's URL Inspection API (limit 2,000 a day).
 * Nothing here waits more than about four minutes in one call.
 */

type Db = ReturnType<typeof createAdminClient>;

const UA = 'Mozilla/5.0 (compatible; HeliaxisSiteCheck/1.0)';
export const KEY_PAGES = 50;
export const SCHEMA_PAGES = 20;
export const LIGHTHOUSE_PAGES = 20;
const LIGHTHOUSE_PER_CALL = 3;

async function get(url: string, timeout = 12_000): Promise<{ status: number; body: string }> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeout), cache: 'no-store' });
    return { status: r.status, body: await r.text() };
  } catch {
    return { status: 0, body: '' };
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

type Row = Omit<HealthRow, 'date' | 'check_key'>;

/** Replace one check's rows for a day (a page fixed since the morning drops out). */
async function putRows(db: Db, date: string, key: HealthCheck, rows: Row[]) {
  await db.from('seo_health').delete().eq('date', date).eq('check_key', key);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('seo_health').insert(rows.slice(i, i + 500).map((r) => ({ date, check_key: key, url: r.url, ok: r.ok, detail: r.detail })));
    if (error) throw new Error(error.message);
  }
}

/** The most important URLs: home, Search Console's best pages (28 days), published content-studio pages, then the sitemap. */
export async function keyPageList(db: Db, n = KEY_PAGES, sitemap?: string[]): Promise<string[]> {
  const base = siteBase();
  const host = new URL(base).host;
  const since = addDays(ukClock().date, -28);
  const [gscRes, contentRes, sm] = await Promise.all([
    db.from('gsc_daily').select('page, impressions').gte('date', since).limit(50000),
    db.from('seo_content').select('slug, kind').eq('status', 'published').limit(200),
    sitemap ? Promise.resolve(sitemap) : get(`${base}/sitemap.xml`).then((r) => (r.status === 200 ? sitemapLocs(r.body, host) : [])),
  ]);
  const pinned = ((contentRes.data ?? []) as { slug: string | null; kind: string }[])
    .filter((c) => c.slug)
    .map((c) => (c.kind === 'blog' && !String(c.slug).startsWith('/blog') ? `/blog/${String(c.slug).replace(/^\//, '')}` : String(c.slug)));
  return keyPages({ gsc: (gscRes.data ?? []) as { page: string; impressions: number }[], pinned, sitemap: sm, host }, n);
}

/* ── The free checks ─────────────────────────────────────────────────────────────────────────────────────────────── */

async function freeChecks(db: Db, today: string) {
  const base = siteBase();
  const host = new URL(base).host;
  const [sm, robots, llms, rendered, posts, audits] = await Promise.all([
    get(`${base}/sitemap.xml`),
    get(`${base}/robots.txt`, 8000),
    get(`${base}/llms.txt`, 8000),
    getCmsRendered().catch(() => null),
    getCmsPublicPosts().catch(() => []),
    recentAudits(1, db).catch(() => []),
  ]);
  const out: Record<string, unknown> = {};

  // Sitemap: every published CMS page and live blog post, and Search Console's report on it.
  const paths = sm.status === 200 ? sitemapLocs(sm.body, host) : [];
  let gsc: ReturnType<typeof sitemapStatus> | null = null;
  if (gscConfigured()) {
    try {
      const j = await gscFetch<{ sitemap?: GscSitemap[] }>(`/webmasters/v3/sites/${encodeURIComponent(gscSite())}/sitemaps`);
      gsc = sitemapStatus(j.sitemap ?? [], `${base}/sitemap.xml`);
    } catch (e) {
      out.gscSitemapError = e instanceof Error ? e.message : 'Search Console did not answer';
    }
  }
  if (sm.status !== 200) {
    await putRows(db, today, 'sitemap', [{ url: '', ok: false, detail: { message: `/sitemap.xml answered ${sm.status || 'nothing'}.`, gsc } }]);
    await raiseAction({ kind: 'index', ref: 'sitemap:unreadable', title: 'The sitemap cannot be read', why: `/sitemap.xml answered ${sm.status || 'nothing'}, so Google cannot find new pages from it.`, fixHref: '/admin/search/health' }, db);
  } else {
    await clearAction('index', 'sitemap:unreadable', db);
    const cov = sitemapCoverage({ sitemap: paths, cmsPages: rendered?.pages ?? [], postSlugs: posts.map((p) => p.slug) });
    await putRows(db, today, 'sitemap', [
      { url: '', ok: !cov.missing.length && (gsc?.ok ?? true), detail: { sitemapUrls: paths.length, expected: cov.expected.length, missing: cov.missing.length, gsc } },
      ...cov.expected.map((p) => ({ url: p, ok: !cov.missing.includes(p), detail: {} })),
    ]);
    if (cov.missing.length)
      await raiseAction({ kind: 'index', ref: 'sitemap:missing', title: `${cov.missing.length} published page${cov.missing.length === 1 ? ' is' : 's are'} missing from the sitemap`, why: cov.missing.slice(0, 6).join(', '), fixHref: '/admin/search/health' }, db);
    else await clearAction('index', 'sitemap:missing', db);
    out.sitemap = { urls: paths.length, missing: cov.missing.length };
  }
  if (gsc && gsc.errors) await raiseAction({ kind: 'index', ref: 'sitemap:errors', title: 'Search Console reports errors in the sitemap', why: gsc.message, fixHref: '/admin/search/health' }, db);
  else if (gsc) await clearAction('index', 'sitemap:errors', db);

  // Orphans and canonicals, from the latest weekly audit (its link graph and each page's canonical).
  const audit = audits[0];
  if (audit && Date.parse(audit.at) > Date.now() - 9 * 86_400_000) {
    const pages = audit.pages.map((p) => ({ path: p.path, status: p.status, canonical: p.canonical, noindex: p.noindex, links: p.links }));
    const orphans = new Set(orphanPages(pages));
    await putRows(db, today, 'orphan', pages.filter((p) => p.status === 200 && p.path !== '/').map((p) => ({ url: p.path, ok: !orphans.has(p.path), detail: { audit: audit.id } })));
    const problems = canonicalProblems(pages, base);
    await putRows(db, today, 'canonical', pages.filter((p) => p.status === 200).map((p) => {
      const bad = problems.filter((x) => x.path === p.path);
      return { url: p.path, ok: !bad.length, detail: { audit: audit.id, canonical: p.canonical, problems: bad.map((b) => b.problem) } };
    }));
    out.orphans = orphans.size;
    out.canonical = problems.length;
  } else out.audit = 'No site audit in the last week; orphans and canonicals wait for Monday’s.';

  // Schema on the key pages.
  const keys = await keyPageList(db, SCHEMA_PAGES, paths);
  const schema = await inBatches(keys, 5, async (p) => {
    const r = await get(`${base}${p}`);
    if (r.status !== 200) return { url: p, ok: false, detail: { status: r.status, problems: [`The page answered ${r.status || 'nothing'}.`] } };
    const v = schemaVerdict(r.body);
    return { url: p, ok: v.ok, detail: { types: v.types, problems: v.problems, notes: v.notes } };
  });
  await putRows(db, today, 'schema', schema);
  out.schema = schema.filter((s) => !s.ok).length;

  // llms.txt (low priority: never a Needs you item).
  const l = llmsVerdict(llms.status, llms.body);
  await putRows(db, today, 'llms', [{ url: '', ok: l.ok, detail: { message: l.message } }]);

  // Meta proposals from the weekly audit: one Needs you item per page waiting.
  const proposals = await readProposals(db).catch(() => []);
  for (const p of proposals) {
    if (p.status === 'proposed') await raiseAction({ kind: 'meta', ref: `meta:${p.path}`, title: `New title and description suggested for ${p.path}`, why: p.reason, fixHref: '/admin/search/health#proposals' }, db);
    else await clearAction('meta', `meta:${p.path}`, db);
  }

  // Crawler access last: its rows mark today's free checks as done.
  if (robots.status === 0) await putRows(db, today, 'crawlers', [{ url: '', ok: false, detail: { message: '/robots.txt did not answer.' } }]);
  else {
    const blocked = robots.status === 200 ? robotsBlocks(robots.body) : [];
    await putRows(db, today, 'crawlers', CRAWLERS.map((bot) => ({ url: bot, ok: !blocked.includes(bot), detail: { robotsStatus: robots.status, message: robots.status === 200 ? (blocked.includes(bot) ? 'Blocked from the whole site by robots.txt.' : 'Allowed.') : 'No robots.txt, so every crawler is allowed.' } })));
    out.crawlersBlocked = blocked.length;
  }
  return out;
}

/* ── Lighthouse (paid) ───────────────────────────────────────────────────────────────────────────────────────────── */

async function lighthouseStep(db: Db, today: string, deadline: number): Promise<{ lighthouse: string; ran: number; left: number }> {
  if (!dfsConfigured()) return { lighthouse: 'DataForSEO is not connected', ran: 0, left: 0 };
  const base = siteBase();
  const pages = await keyPageList(db, LIGHTHOUSE_PAGES);
  const { data } = await db.from('seo_health').select('url').eq('check_key', 'lighthouse').gte('date', `${today.slice(0, 7)}-01`).limit(500);
  const done = new Set((data ?? []).map((r) => String(r.url)));
  const todo = pages.filter((p) => !done.has(p));
  let ran = 0;
  for (const p of todo) {
    if (ran >= LIGHTHOUSE_PER_CALL || Date.now() > deadline - 130_000) break;
    try {
      await checkCap(LIGHTHOUSE_COST, {}, db);
    } catch (e) {
      return { lighthouse: e instanceof Error ? e.message : 'Over the cap', ran, left: todo.length - ran };
    }
    let row: Row;
    try {
      const { tasks, cost } = await dfs('/on_page/lighthouse/live/json', [{ url: `${base}${p}`, for_mobile: true, categories: ['performance', 'seo', 'accessibility'] }], { module: 'm7', timeoutMs: 120_000 });
      const t = tasks[0];
      if (!t || t.status_code !== 20000) row = { url: p, ok: false, detail: { error: t?.status_message ?? 'No result', cost } };
      else row = { url: p, ok: readLighthouse(t.result?.[0]).ok, detail: { ...readLighthouse(t.result?.[0]), cost: t.cost ?? cost } };
    } catch (e) {
      row = { url: p, ok: false, detail: { error: e instanceof Error ? e.message : 'Lighthouse failed' } };
    }
    await db.from('seo_health').upsert({ date: today, check_key: 'lighthouse', url: row.url, ok: row.ok, detail: row.detail }, { onConflict: 'date,check_key,url' });
    ran++;
  }
  return { lighthouse: 'ok', ran, left: todo.length - ran };
}

/* ── Job handlers ────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Weekly, Monday after the site audit (and safe to call again): the free checks once a day, then up to three Lighthouse
 * runs. `more` is true while key pages still need this month's Lighthouse run: queue it again to carry on.
 */
export async function runHealthChecks(db: Db = createAdminClient(), opts: { force?: boolean; lighthouse?: boolean; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 230_000);
  const today = ukClock().date;
  const { data: done } = await db.from('seo_health').select('url').eq('date', today).eq('check_key', 'crawlers').limit(1);
  const free = !done?.length || opts.force ? await freeChecks(db, today) : 'already ran today';
  const lh = opts.lighthouse === false ? { lighthouse: 'skipped', ran: 0, left: 0 } : await lighthouseStep(db, today, deadline);
  return { date: today, free, ...lh, more: lh.lighthouse === 'ok' && lh.left > 0 };
}

/** Daily: the key URLs through URL Inspection (each once a day). Not indexed → a Needs you `index` item; indexed → cleared. */
export async function runIndexChecks(db: Db = createAdminClient(), opts: { limit?: number; budgetMs?: number } = {}) {
  if (!gscConfigured()) return { checked: 0, skipped: 'Search Console is not connected' };
  const deadline = Date.now() + (opts.budgetMs ?? 200_000);
  const today = ukClock().date;
  const base = siteBase();
  const pages = await keyPageList(db, Math.min(opts.limit ?? KEY_PAGES, KEY_PAGES));
  const { data } = await db.from('seo_health').select('url').eq('date', today).eq('check_key', 'index').limit(500);
  const done = new Set((data ?? []).map((r) => String(r.url)));
  const todo = pages.filter((p) => !done.has(p));
  let checked = 0;
  let notIndexed = 0;
  const errors: string[] = [];
  for (let i = 0; i < todo.length && Date.now() < deadline; i += 5) {
    const got = await Promise.all(
      todo.slice(i, i + 5).map(async (p) => {
        try {
          return { p, r: readInspection(await gscFetch<Inspection>('/v1/urlInspection/index:inspect', { inspectionUrl: `${base}${p === '/' ? '/' : p}`, siteUrl: gscSite(), languageCode: 'en-GB' })) };
        } catch (e) {
          errors.push(`${p}: ${e instanceof Error ? e.message : 'failed'}`);
          return null;
        }
      }),
    );
    // A whole first batch failing is a setup problem (no access to the property, quota): stop rather than hammer it.
    if (i === 0 && got.every((g) => !g)) break;
    for (const g of got) {
      if (!g) continue;
      checked++;
      await db.from('seo_health').upsert({ date: today, check_key: 'index', url: g.p, ok: g.r.indexed, detail: g.r.detail }, { onConflict: 'date,check_key,url' });
      if (g.r.indexed) await clearAction('index', `index:${g.p}`, db);
      else {
        notIndexed++;
        await raiseAction({ kind: 'index', ref: `index:${g.p}`, title: `Not in Google’s index: ${g.p}`, why: `URL Inspection says “${g.r.coverage}”${g.r.lastCrawl ? `; last crawled ${g.r.lastCrawl.slice(0, 10)}` : '; never crawled'}.`, fixHref: '/admin/search/health#index' }, db);
      }
    }
  }
  return { checked, notIndexed, left: todo.length - checked - errors.length, errors: errors.slice(0, 5) };
}

/* ── Reading back (the page and the reports) ─────────────────────────────────────────────────────────────────────── */

export async function latestHealth(db: Db = createAdminClient()) {
  const since = addDays(ukClock().date, -62);
  const { data } = await db.from('seo_health').select('date, check_key, url, ok, detail').gte('date', since).order('date', { ascending: false }).limit(10000);
  const latest = latestByCheck((data ?? []) as HealthRow[]);
  return { latest, summary: healthSummary(latest) };
}
