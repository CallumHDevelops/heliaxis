import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { dfs, dfsConfigured, type DfsTask } from '@/lib/dataforseo/client';
import { isOurs } from '@/lib/seo/rankings';
import { ukDay } from '@/lib/seo/serp';
import { aiConfig, aiHeaders } from '@/lib/studio/ai';
import { recordChatUsage, type AiFeature } from '@/lib/ai-usage';
import { callCostUsd } from '@/lib/social/costs';
import { checkCap, getSetting } from '@/lib/search/server';
import { assertAiBudget } from '@/lib/search/ai-budget';
import {
  buildPageFacts,
  hostOf,
  normName,
  parseBusinessInfo,
  parseContentParsing,
  parseHtmlExtras,
  parseInstantPages,
  parseLighthouse,
  parseReviews,
  robotsAllows,
  sameName,
  triedRecently,
  addTry,
  unsavedFactsRow,
  type PageFactsRow,
  type ProfileTry,
} from './parse';
import { buildCard, buildPrompt, checkWriteup, parseWriteup, type BusinessFact, type CheckedWriteup, type TeardownFacts } from './card';

/**
 * M2 SERP teardown, the jobs (spec §5 M2, §7). Three handlers the dispatcher calls repeatedly, each doing a bounded batch:
 *   runPageFacts      On-Page facts for every top-10 URL of the latest phone run (cached 30 days, robots.txt respected)
 *   runBusinessProfiles  each map-pack business's Google Business Profile, then its newest 50 reviews (posted, collected later)
 *   runTeardowns      the "What it takes" card and the write-up for each priority-1 search
 * Every paid call is estimated, checked against the cap, and logged with module "m2".
 */

type Db = ReturnType<typeof createAdminClient>;
const DAY = 86_400_000;
export const FACTS_TTL_DAYS = 30;
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (compatible; HeliaxisSearch/1.0; +https://heliaxis.co.uk)';
/** The AI write-up's usage row (ai_usage.feature is free text; AiFeature gains this value in a shared change). */
const AI_FEATURE: AiFeature = 'seo_teardown';

/** Unit prices (Nov 2026, spec §4.1) for the pre-flight estimates. What is logged is the real cost DataForSEO returns. */
export const M2_PRICE = {
  instantPage: 0.00015,
  contentParsing: 0.00015,
  lighthouse: 0.005,
  businessInfo: 0.0054,
  reviewsPer10: 0.00075,
} as const;
export const REVIEW_DEPTH = 50;
export const pageFactsCost = (pages: number, lighthouse = 0) => pages * (M2_PRICE.instantPage + M2_PRICE.contentParsing) + lighthouse * M2_PRICE.lighthouse;
export const businessCost = (n: number) => n * (M2_PRICE.businessInfo + (REVIEW_DEPTH / 10) * M2_PRICE.reviewsPer10);

/** Lighthouse is optional (spec: monthly, top pages only): on with SEARCH_LIGHTHOUSE=1 or { lighthouse: true }. */
const lighthouseOn = (opt?: boolean) => opt ?? process.env.SEARCH_LIGHTHOUSE === '1';

const absolute = (u: string) => (/^https?:\/\//i.test(u) ? u : `${SITE()}/${u.replace(/^\//, '')}`);

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const chunks = <T,>(xs: T[], size: number) => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, i * size + size));

/* ── Which run, which searches, which URLs ──────────────────────────────────────────────────────────────────────── */

/** The date of the latest finished phone run (weekly or monthly), or the latest phone result if none has closed yet. */
export async function latestRunDate(db: Db = createAdminClient()): Promise<string | null> {
  const { data } = await db.from('seo_serp_run').select('run_date').eq('device', 'mobile').eq('status', 'done').in('kind', ['weekly', 'monthly']).order('run_date', { ascending: false }).limit(1);
  if (data?.[0]?.run_date) return data[0].run_date as string;
  const { data: r } = await db.from('seo_serp_result').select('date').eq('device', 'mobile').order('date', { ascending: false }).limit(1);
  return (r?.[0]?.date as string | undefined) ?? null;
}

type Kw = { id: number; phrase: string; town: string | null; priority: number; target_page: string | null; location_code: number | null };

async function activeKeywords(db: Db): Promise<Kw[]> {
  const { data } = await db.from('seo_keyword').select('id, phrase, town, priority, target_page, location_code').eq('active', true).order('priority').order('id');
  return (data ?? []) as Kw[];
}

async function trackedTowns(db: Db): Promise<string[]> {
  const { data } = await db.from('seo_keyword').select('town').eq('active', true);
  return [...new Set((data ?? []).map((r) => String(r.town ?? '').trim()).filter(Boolean))].sort();
}

type Target = { url: string; rank: number; top: boolean };

/**
 * Every URL the teardowns need, most important first: the top 10 of each search in the latest run (priority 1 first),
 * plus our ranking page, or our target page where we don't rank. "top" marks the pages Lighthouse is run on: the top 3 of
 * a priority-1 search, and ours.
 */
async function pageTargets(db: Db, date: string, only?: number[]): Promise<Target[]> {
  const kws = (await activeKeywords(db)).filter((k) => !only || only.includes(k.id));
  const pri = new Map(kws.map((k) => [k.id, k.priority]));
  const ids = kws.map((k) => k.id);
  if (!ids.length) return [];
  const items: { keyword_id: number; pos: number; url: string | null }[] = [];
  const results: { keyword_id: number; our_url: string | null }[] = [];
  for (const c of chunks(ids, 200)) {
    const [{ data: it }, { data: rs }] = await Promise.all([
      db.from('seo_serp_item').select('keyword_id, pos, url').eq('date', date).eq('device', 'mobile').eq('type', 'organic').lte('pos', 10).in('keyword_id', c).limit(5000),
      db.from('seo_serp_result').select('keyword_id, our_url').eq('date', date).eq('device', 'mobile').in('keyword_id', c),
    ]);
    items.push(...((it ?? []) as typeof items));
    results.push(...((rs ?? []) as typeof results));
  }
  const by = new Map<string, Target>();
  const add = (url: string | null | undefined, rank: number, top: boolean) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    const e = by.get(url);
    if (!e) by.set(url, { url, rank, top });
    else {
      e.rank = Math.min(e.rank, rank);
      e.top ||= top;
    }
  };
  for (const i of items) add(i.url, (pri.get(i.keyword_id) ?? 3) * 100 + i.pos, pri.get(i.keyword_id) === 1 && i.pos <= 3);
  const ranking = new Map(results.map((r) => [r.keyword_id, r.our_url]));
  for (const k of kws) {
    const ours = ranking.get(k.id) ?? (k.target_page ? absolute(k.target_page) : null);
    add(ours, k.priority * 100, k.priority === 1);
  }
  return [...by.values()].sort((a, b) => a.rank - b.rank || a.url.localeCompare(b.url));
}

/* ── Page facts ─────────────────────────────────────────────────────────────────────────────────────────────────── */

async function fetchText(url: string, timeoutMs = 10_000): Promise<{ status: number; body: string; type: string }> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    return { status: r.status, body: (await r.text()).slice(0, 1_500_000), type: r.headers.get('content-type') ?? '' };
  } catch {
    return { status: 0, body: '', type: '' };
  }
}

/** robots.txt per site, read once per batch. A missing or unreadable file allows everything (the standard reading). */
function robotsReader() {
  const cache = new Map<string, Promise<string | null>>();
  return async (url: string): Promise<boolean> => {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return false;
    }
    if (!cache.has(origin)) cache.set(origin, fetchText(`${origin}/robots.txt`, 8_000).then((r) => (r.status === 200 && !/html/i.test(r.type) ? r.body : null)));
    const body = await cache.get(origin)!;
    return body === null ? true : robotsAllows(body, url, ['dataforseobot', 'heliaxissearch']);
  };
}

const firstTask = (r: { tasks: DfsTask[] }) => r.tasks[0];
const taskOk = (t: DfsTask | undefined) => !!t && t.status_code === 20000;

/** Read one page: instant_pages and content_parsing (one call each) plus its HTML for structured data. Never throws. */
async function readPage(url: string, towns: string[], opts: { lighthouse: boolean; allowed: (u: string) => Promise<boolean> }): Promise<{ row: PageFactsRow; lighthouseRun: boolean }> {
  if (!(await opts.allowed(url))) {
    return { row: buildPageFacts({ url, towns, instant: null, content: null, error: 'robots.txt asks crawlers not to read this page' }), lighthouseRun: false };
  }
  const errors: string[] = [];
  const call = async (path: string, body: unknown, timeoutMs: number) => {
    try {
      const t = firstTask(await dfs(path, body, { module: 'm2', timeoutMs }));
      if (!taskOk(t)) errors.push(`${path.split('/')[2]}: ${t?.status_message ?? 'no result'}`);
      return taskOk(t) ? t : null;
    } catch (e) {
      errors.push(`${path.split('/')[2]}: ${e instanceof Error ? e.message : 'failed'}`);
      return null;
    }
  };
  const [ip, cp, html, lh] = await Promise.all([
    call('/on_page/instant_pages', [{ url, enable_javascript: false, accept_language: 'en-GB' }], 90_000),
    call('/on_page/content_parsing/live', [{ url }], 90_000),
    fetchText(url, 12_000).then((r) => (r.status === 200 && /html/i.test(r.type) ? parseHtmlExtras(r.body, url) : null)),
    opts.lighthouse ? call('/on_page/lighthouse/live/json', [{ url, for_mobile: true, categories: ['performance'] }], 150_000) : Promise.resolve(null),
  ]);
  const instant = ip ? parseInstantPages(ip) : null;
  const content = cp ? parseContentParsing(cp) : null;
  const row = buildPageFacts({ url, towns, instant, content, html, error: instant || content ? null : errors.join('; ') || 'DataForSEO could not read the page' });
  if (lh) row.lighthouse_perf = parseLighthouse(lh);
  return { row, lighthouseRun: !!lh };
}

export type PageFactsOutcome = { done: number; remaining: number; costUsd: number; date: string | null; note?: string };

/**
 * Page facts for the top-10 URLs of the latest phone run that are missing or older than 30 days, `limit` pages a call
 * (default 12, about 15 to 60 seconds). Call again while `remaining` is above 0.
 */
export async function runPageFacts(db: Db = createAdminClient(), opts: { limit?: number; lighthouse?: boolean; keywordIds?: number[]; force?: boolean } = {}): Promise<PageFactsOutcome> {
  const date = await latestRunDate(db);
  if (!date) return { done: 0, remaining: 0, costUsd: 0, date, note: 'No rankings run yet.' };
  if (!dfsConfigured()) return { done: 0, remaining: 0, costUsd: 0, date, note: 'DataForSEO is not set up.' };
  const [targets, towns] = await Promise.all([pageTargets(db, date, opts.keywordIds), trackedTowns(db)]);
  const have = new Map<string, { fetched_at: string; lighthouse_perf: number | null }>();
  for (const c of chunks(targets.map((t) => t.url), 150)) {
    const { data } = await db.from('seo_page_facts').select('url, fetched_at, lighthouse_perf').in('url', c);
    for (const r of data ?? []) have.set(r.url as string, { fetched_at: r.fetched_at as string, lighthouse_perf: (r.lighthouse_perf as number | null) ?? null });
  }
  const stale = Date.now() - FACTS_TTL_DAYS * DAY;
  const need = targets.filter((t) => opts.force || !have.has(t.url) || Date.parse(have.get(t.url)!.fetched_at) < stale);
  const batch = need.slice(0, Math.max(1, opts.limit ?? 12));
  if (!batch.length) return { done: 0, remaining: 0, costUsd: 0, date };
  const lh = lighthouseOn(opts.lighthouse);
  const lhCount = lh ? batch.filter((t) => t.top).length : 0;
  const estimate = pageFactsCost(batch.length, lhCount);
  await checkCap(estimate, {}, db);

  const allowed = robotsReader();
  const at = new Date().toISOString();
  let cost = 0;
  await pool(batch, 4, async (t) => {
    const { row, lighthouseRun } = await readPage(t.url, towns, { lighthouse: lh && t.top, allowed });
    if (!lighthouseRun) row.lighthouse_perf = have.get(t.url)?.lighthouse_perf ?? null;
    const { error } = await db.from('seo_page_facts').upsert({ ...row, fetched_at: at });
    if (error) {
      console.error('seo_page_facts upsert failed', t.url, error.message);
      // The read was paid for: keep a row marked with the error so the next round does not buy it again.
      const { error: e2 } = await db.from('seo_page_facts').upsert(unsavedFactsRow(t.url, at, error.message));
      if (e2) console.error('seo_page_facts error row failed', t.url, e2.message);
    }
    cost += row.error && /robots/.test(row.error) ? 0 : pageFactsCost(1, lighthouseRun ? 1 : 0);
  });
  return { done: batch.length, remaining: need.length - batch.length, costUsd: Math.round(cost * 100000) / 100000, date };
}

/* ── Business Profiles and reviews ──────────────────────────────────────────────────────────────────────────────── */

const PENDING_KEY = 'seo-m2:review-tasks';
type Pending = { taskId: string; businessId: number; date: string; postedAt: string };

/** The review tasks waiting to be collected, and the paid profile lookups that left nothing saved (`tried`). */
async function readPending(db: Db): Promise<{ tasks: Pending[]; tried: ProfileTry[] }> {
  const { data } = await db.from('cms_kv').select('value').eq('key', PENDING_KEY).maybeSingle();
  const v = parseKv<{ tasks: Pending[]; tried?: ProfileTry[] }>(data?.value);
  return { tasks: Array.isArray(v.tasks) ? v.tasks : [], tried: Array.isArray(v.tried) ? v.tried : [] };
}
async function writePending(tasks: Pending[], tried: ProfileTry[], db: Db) {
  await db.from('cms_kv').upsert({ key: PENDING_KEY, value: toKv({ tasks, tried }), updated_at: new Date().toISOString() });
}

type Wanted = { name: string; town: string | null; locationCode: number | null; domain: string | null; ours: boolean };
type BizRow = { id: number; cid: string | null; place_id: string | null; name: string; domain: string | null; website: string | null; competitor_id: string | null; is_ours: boolean };

/** The map-pack businesses in the latest phone run (by name, with the town of the first search they appeared in), and us. */
async function wantedBusinesses(db: Db, date: string): Promise<Wanted[]> {
  const [{ data: pack }, kws, business] = await Promise.all([
    db.from('seo_serp_item').select('keyword_id, pos, title, domain').eq('date', date).eq('device', 'mobile').eq('type', 'local_pack').limit(5000),
    activeKeywords(db),
    getSetting('business', db),
  ]);
  const kw = new Map(kws.map((k) => [k.id, k]));
  const out = new Map<string, Wanted>();
  const rows = ((pack ?? []) as { keyword_id: number; pos: number; title: string | null; domain: string | null }[]).sort((a, b) => (kw.get(a.keyword_id)?.priority ?? 3) - (kw.get(b.keyword_id)?.priority ?? 3) || a.pos - b.pos);
  for (const p of rows) {
    const name = String(p.title ?? '').trim();
    const k = kw.get(p.keyword_id);
    if (!name || !k) continue;
    const key = normName(name);
    if (!key || out.has(key)) continue;
    const ours = /heliaxis/i.test(name) || (!!p.domain && isOurs(p.domain));
    out.set(key, { name, town: k.town, locationCode: k.location_code, domain: p.domain, ours });
  }
  // Ourselves, even where we are not in any pack: the card compares every pack with us.
  if (![...out.values()].some((w) => w.ours)) {
    const home = kws.find((k) => k.priority === 1 && k.location_code) ?? kws.find((k) => k.location_code);
    out.set(normName(business.name), { name: business.name, town: home?.town ?? null, locationCode: home?.location_code ?? null, domain: hostOf(business.website) || null, ours: true });
  }
  // Us first, then by order of appearance.
  return [...out.values()].sort((a, b) => Number(b.ours) - Number(a.ours));
}

export type BusinessOutcome = { done: number; remaining: number; collected: number; posted: number; costUsd: number; note?: string };

/**
 * Business Profiles for the map-pack businesses (refreshed weekly) and their review pace. Each call first collects any
 * review tasks that are ready, then looks up to `limit` profiles (default 8) and posts their reviews task (newest first,
 * depth 50). Call again while `remaining` is above 0; reviews land within minutes on a later call.
 */
export async function runBusinessProfiles(db: Db = createAdminClient(), opts: { limit?: number } = {}): Promise<BusinessOutcome> {
  if (!dfsConfigured()) return { done: 0, remaining: 0, collected: 0, posted: 0, costUsd: 0, note: 'DataForSEO is not set up.' };
  const limit = Math.max(1, opts.limit ?? 8);
  const today = ukDay();

  // 1. Collect reviews tasks that are ready (task_get is free).
  const stored = await readPending(db);
  let pending = stored.tasks;
  let tried = stored.tried;
  let collected = 0;
  const keep: Pending[] = [];
  for (const p of pending) {
    if (collected >= limit * 2 || Date.now() - Date.parse(p.postedAt) < 60_000) {
      keep.push(p);
      continue;
    }
    try {
      const t = firstTask(await dfs(`/business_data/google/reviews/task_get/${p.taskId}`, undefined, { module: 'm2', timeoutMs: 45_000, log: false }));
      if (t && (t.status_code === 40601 || t.status_code === 40602 || t.status_code === 40100)) {
        if (Date.now() - Date.parse(p.postedAt) < 3 * DAY) keep.push(p);
        continue;
      }
      const pace = taskOk(t) ? parseReviews(t, new Date(), REVIEW_DEPTH) : null;
      if (pace) {
        await db
          .from('seo_business_snapshot')
          .update({ reviews_90d: pace.reviews90d, responded_pct: pace.respondedPct, ...(pace.reviews !== null ? { reviews: pace.reviews } : {}), ...(pace.rating !== null ? { rating: pace.rating } : {}) })
          .eq('business_id', p.businessId)
          .eq('date', p.date);
        collected++;
      }
    } catch {
      if (Date.now() - Date.parse(p.postedAt) < 3 * DAY) keep.push(p);
    }
  }
  pending = keep;

  // 2. Profiles not looked up in the last 7 days.
  const date = await latestRunDate(db);
  const wanted = date ? await wantedBusinesses(db, date) : [];
  const { data: bizData } = await db.from('seo_business').select('id, cid, place_id, name, domain, website, competitor_id, is_ours');
  const businesses = (bizData ?? []) as BizRow[];
  const { data: recentSnaps } = await db.from('seo_business_snapshot').select('business_id').gte('date', new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10));
  const fresh = new Set((recentSnaps ?? []).map((s) => s.business_id as number));
  const match = (w: Wanted) => businesses.find((b) => (w.ours && b.is_ours) || sameName(b.name, w.name) || (!!w.domain && b.domain === w.domain));
  const todo = wanted.filter((w) => {
    const b = match(w);
    // A lookup paid for this week that saved nothing usable is not bought again until next week.
    return (!b || !fresh.has(b.id)) && !triedRecently(tried, w.name, today);
  });
  const batch = todo.slice(0, limit);
  let posted = 0;
  let cost = 0;
  if (batch.length) {
    await checkCap(businessCost(batch.length), {}, db);
    const { data: comps } = await db.from('social_competitor').select('id, name, website, google_place_id, is_self');
    const competitors = (comps ?? []) as { id: string; name: string; website: string | null; google_place_id: string | null; is_self: boolean }[];

    for (const w of batch) {
      const existing = match(w);
      const keyword = existing?.cid ? `cid:${existing.cid}` : [w.name, w.town].filter(Boolean).join(' ');
      let info: ReturnType<typeof parseBusinessInfo> = null;
      try {
        const t = firstTask(await dfs('/business_data/google/my_business_info/live', [{ keyword, location_code: w.locationCode ?? 2826, language_code: 'en' }], { module: 'm2', timeoutMs: 90_000 }));
        cost += M2_PRICE.businessInfo;
        info = taskOk(t) ? parseBusinessInfo(t) : null;
      } catch (e) {
        console.error('my_business_info failed', w.name, e);
        continue; // try again on a later call
      }
      // Google answers with its closest match: keep it only if it is the same business.
      if (info && !existing?.cid && !sameName(info.name, w.name) && !(w.domain && info.domain === w.domain)) info = null;

      let id = existing?.id ?? null;
      const byCid = info?.cid ? businesses.find((b) => b.cid === info!.cid) : undefined;
      if (!id && byCid) id = byCid.id;
      const fields = {
        name: info?.name ?? w.name,
        domain: info?.domain ?? w.domain ?? existing?.domain ?? null,
        is_ours: w.ours || !!(info?.domain && isOurs(info.domain)),
        ...(info
          ? { cid: info.cid, place_id: info.place_id, primary_category: info.primary_category, categories: info.categories, website: info.website, address: info.address, phone: info.phone, lat: info.lat, lng: info.lng }
          : {}),
      };
      // Link to the social competitor list by domain or name, and fill its blanks.
      const comp = competitors.find((c) => (fields.domain && c.website && hostOf(c.website) === fields.domain) || sameName(c.name, fields.name) || (w.ours && c.is_self));
      if (id) {
        await db.from('seo_business').update({ ...fields, ...(comp ? { competitor_id: comp.id } : {}) }).eq('id', id);
      } else {
        const { data: ins, error } = await db.from('seo_business').insert({ ...fields, ...(comp ? { competitor_id: comp.id } : {}) }).select('id').single();
        if (error || !ins) {
          console.error('seo_business insert failed', w.name, error?.message);
          tried = addTry(tried, w.name, today, `Profile looked up but not saved: ${error?.message ?? 'no row returned'}`);
          continue;
        }
        id = ins.id as number;
        businesses.push({ id, cid: fields.cid ?? null, place_id: fields.place_id ?? null, name: fields.name, domain: fields.domain, website: fields.website ?? null, competitor_id: comp?.id ?? null, is_ours: fields.is_ours });
      }
      if (comp && info) {
        const fill: Record<string, string> = {};
        if (!comp.website && info.website) fill.website = info.website;
        if (!comp.google_place_id && info.place_id) fill.google_place_id = info.place_id;
        if (Object.keys(fill).length) {
          await db.from('social_competitor').update(fill).eq('id', comp.id);
          Object.assign(comp, fill);
        }
      }
      // This week's snapshot: what the profile says now; the review pace arrives with the reviews task.
      const { error: snapErr } = await db.from('seo_business_snapshot').upsert({ business_id: id, date: today, rating: info?.rating ?? null, reviews: info?.reviews ?? null, photos: info?.photos ?? null });
      if (snapErr) {
        console.error('seo_business_snapshot upsert failed', w.name, snapErr.message);
        tried = addTry(tried, w.name, today, `Profile looked up but this week's snapshot was not saved: ${snapErr.message}`);
      }
      if (!info || (!info.cid && !info.place_id)) continue;
      try {
        const t = firstTask(
          await dfs(
            '/business_data/google/reviews/task_post',
            [{ ...(info.cid ? { cid: info.cid } : { place_id: info.place_id }), location_code: w.locationCode ?? 2826, language_code: 'en', depth: REVIEW_DEPTH, sort_by: 'newest', tag: `m2:${id}:${today}` }],
            { module: 'm2' },
          ),
        );
        if (t && (t.status_code === 20100 || t.status_code === 20000)) {
          pending.push({ taskId: t.id, businessId: id, date: today, postedAt: new Date().toISOString() });
          posted++;
          cost += (REVIEW_DEPTH / 10) * M2_PRICE.reviewsPer10;
        }
      } catch (e) {
        console.error('reviews task_post failed', w.name, e);
      }
    }
  }
  await writePending(pending, tried, db);
  return { done: batch.length, remaining: todo.length - batch.length + pending.length, collected, posted, costUsd: Math.round(cost * 100000) / 100000 };
}

/* ── Teardowns ──────────────────────────────────────────────────────────────────────────────────────────────────── */

async function businessFacts(db: Db): Promise<BusinessFact[]> {
  const [{ data: biz }, { data: snaps }] = await Promise.all([
    db.from('seo_business').select('id, name, is_ours, website'),
    db.from('seo_business_snapshot').select('business_id, date, rating, reviews, reviews_90d, photos').order('date', { ascending: false }).limit(5000),
  ]);
  const latest = new Map<number, { date: string; rating: number | null; reviews: number | null; reviews_90d: number | null; photos: number | null }>();
  for (const s of snaps ?? []) if (!latest.has(s.business_id as number)) latest.set(s.business_id as number, s as never);
  return ((biz ?? []) as { id: number; name: string; is_ours: boolean; website: string | null }[]).map((b) => {
    const s = latest.get(b.id);
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return { id: b.id, name: b.name, isOurs: b.is_ours, website: b.website, snapDate: s?.date ?? null, rating: num(s?.rating), reviews: num(s?.reviews), reviews90d: num(s?.reviews_90d), photos: num(s?.photos) };
  });
}

const normaliseFacts = (r: Record<string, unknown>): PageFactsRow =>
  ({
    ...r,
    headings: Array.isArray(r.headings) ? r.headings : [],
    questions: Array.isArray(r.questions) ? r.questions : [],
    schema: Array.isArray(r.schema) ? r.schema : [],
    town_mentions: r.town_mentions && typeof r.town_mentions === 'object' ? r.town_mentions : {},
    lighthouse_perf: r.lighthouse_perf === null || r.lighthouse_perf === undefined ? null : Number(r.lighthouse_perf),
  }) as PageFactsRow;

/** The stored inputs for one search's card. */
async function cardInputs(db: Db, kw: Kw, date: string) {
  const [{ data: items }, { data: result }] = await Promise.all([
    db.from('seo_serp_item').select('pos, type, domain, url, title').eq('keyword_id', kw.id).eq('date', date).eq('device', 'mobile').or('type.eq.local_pack,pos.lte.10'),
    db.from('seo_serp_result').select('our_pos, our_pack_pos, our_url').eq('keyword_id', kw.id).eq('date', date).eq('device', 'mobile').maybeSingle(),
  ]);
  const ourPage = result?.our_url ? { url: result.our_url as string, from: 'ranking' as const } : kw.target_page ? { url: absolute(kw.target_page), from: 'target' as const } : null;
  const urls = [...new Set([...(items ?? []).filter((i) => i.type === 'organic' && i.url).map((i) => i.url as string), ...(ourPage ? [ourPage.url] : [])])];
  const { data: facts } = urls.length ? await db.from('seo_page_facts').select('*').in('url', urls) : { data: [] };
  return { items: (items ?? []) as { pos: number; type: string; domain: string | null; url: string | null; title: string | null }[], result, ourPage, urls, facts: (facts ?? []).map((f) => normaliseFacts(f as Record<string, unknown>)) };
}

export type TeardownSummary = CheckedWriteup & { writtenAt: string; note?: string };

/** Ask the writing assistant for {shared, gaps, outline}; any line with a number not on the card is rejected (one retry). */
async function writeUp(card: TeardownFacts, pages: PageFactsRow[]): Promise<{ summary: TeardownSummary; model: string | null; costUsd: number }> {
  const { apiKey, baseUrl, model } = aiConfig();
  const writtenAt = new Date().toISOString();
  if (!apiKey) return { summary: { shared: [], gaps: [], outline: [], rejected: [], writtenAt, note: 'The writing assistant is not set up, so only the figures are shown.' }, model: null, costUsd: 0 };
  if (!card.top10.some((t) => t.read) && !card.pack.length) return { summary: { shared: [], gaps: [], outline: [], rejected: [], writtenAt, note: 'No page in the top 10 could be read yet, so there is nothing to write up.' }, model: null, costUsd: 0 };
  let cost = 0;
  let feedback: string[] | undefined;
  let best: CheckedWriteup | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Each try is a paid model call: none once the month's AI spend has reached its cap.
    try {
      await assertAiBudget('writing the teardown');
    } catch (e) {
      if (best) break;
      return { summary: { shared: [], gaps: [], outline: [], rejected: [], writtenAt, note: `${e instanceof Error ? e.message : 'Over the AI cap.'} Only the figures are shown.` }, model: null, costUsd: cost };
    }
    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: aiHeaders(apiKey),
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1500, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: buildPrompt(card, pages, feedback) }] }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const usage = d?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      await recordChatUsage(AI_FEATURE, model, usage);
      cost += callCostUsd(model, { input_tokens: usage?.prompt_tokens ?? 0, output_tokens: usage?.completion_tokens ?? 0 });
      const w = parseWriteup(String(d?.choices?.[0]?.message?.content ?? ''));
      if (!w) continue;
      const checked = checkWriteup(w, card);
      if (!best || checked.rejected.length < best.rejected.length) best = checked;
      if (!checked.rejected.length) break;
      feedback = [...new Set(checked.rejected.flatMap((x) => x.numbers))];
    } catch {
      /* try once more, then give up */
    }
  }
  if (!best) return { summary: { shared: [], gaps: [], outline: [], rejected: [], writtenAt, note: 'The writing assistant did not answer, so only the figures are shown.' }, model, costUsd: cost };
  return {
    summary: { ...best, writtenAt, ...(best.rejected.length ? { note: `${best.rejected.length} line${best.rejected.length === 1 ? ' was' : 's were'} left out because they used numbers not in the facts.` } : {}) },
    model,
    costUsd: Math.round(cost * 100000) / 100000,
  };
}

/** Build and store one search's teardown for a run date (replacing any earlier one for that date). */
export async function buildTeardown(db: Db, kw: Kw, date: string): Promise<{ facts: TeardownFacts; summary: TeardownSummary; costUsd: number }> {
  const inputs = await cardInputs(db, kw, date);
  const businesses = await businessFacts(db);
  const card = buildCard({
    keyword: { id: kw.id, phrase: kw.phrase, town: kw.town },
    date,
    result: inputs.result ? { our_pos: inputs.result.our_pos as number | null, our_pack_pos: inputs.result.our_pack_pos as number | null, our_url: inputs.result.our_url as string | null } : null,
    items: inputs.items,
    facts: new Map(inputs.facts.map((f) => [f.url, f])),
    ourPage: inputs.ourPage,
    businesses,
    ourBusiness: businesses.find((b) => b.isOurs) ?? null,
  });
  const { summary, model, costUsd } = await writeUp(card, inputs.facts);
  const { error } = await db.from('seo_teardown').upsert({ keyword_id: kw.id, date, facts: card, summary, model, cost_usd: costUsd });
  if (error) throw new Error(error.message);
  return { facts: card, summary, costUsd };
}

export type TeardownOutcome = { done: number; remaining: number; waiting: number; costUsd: number; date: string | null; note?: string };

/**
 * Teardowns for the priority-1 searches of the latest phone run that have none for that date, `limit` a call (default 3).
 * A search whose top-10 pages have not all been read yet waits for runPageFacts (unless DataForSEO is not set up, when
 * the card is built from whatever is stored).
 */
export async function runTeardowns(db: Db = createAdminClient(), opts: { limit?: number } = {}): Promise<TeardownOutcome> {
  const date = await latestRunDate(db);
  if (!date) return { done: 0, remaining: 0, waiting: 0, costUsd: 0, date, note: 'No rankings run yet.' };
  const kws = (await activeKeywords(db)).filter((k) => k.priority === 1);
  const { data: have } = await db.from('seo_teardown').select('keyword_id').eq('date', date);
  const done = new Set((have ?? []).map((r) => r.keyword_id as number));
  const todo = kws.filter((k) => !done.has(k.id));
  const limit = Math.max(1, opts.limit ?? 3);
  let built = 0;
  let waiting = 0;
  let cost = 0;
  for (const kw of todo) {
    if (built >= limit) break;
    const { data: urls } = await db.from('seo_serp_item').select('url').eq('keyword_id', kw.id).eq('date', date).eq('device', 'mobile').eq('type', 'organic').lte('pos', 10);
    const list = [...new Set((urls ?? []).map((u) => u.url as string | null).filter((u): u is string => !!u))];
    if (list.length && dfsConfigured()) {
      const { count } = await db.from('seo_page_facts').select('url', { count: 'exact', head: true }).in('url', list);
      if ((count ?? 0) < list.length) {
        waiting++;
        continue;
      }
    }
    const r = await buildTeardown(db, kw, date);
    cost += r.costUsd;
    built++;
  }
  return { done: built, remaining: todo.length - built, waiting, costUsd: Math.round(cost * 100000) / 100000, date };
}

/* ── One search on demand (the Rebuild button) ──────────────────────────────────────────────────────────────────── */

/** What rebuilding one search would cost: the pages still to read (DataForSEO) and one write-up (the writing assistant). */
export async function estimateRebuild(keywordId: number, db: Db = createAdminClient()): Promise<{ pages: number; dataforseoUsd: number; aiUsd: number; date: string | null }> {
  const date = await latestRunDate(db);
  if (!date) return { pages: 0, dataforseoUsd: 0, aiUsd: 0, date };
  const targets = await pageTargets(db, date, [keywordId]);
  const { data } = targets.length ? await db.from('seo_page_facts').select('url, fetched_at').in('url', targets.map((t) => t.url)) : { data: [] };
  const fresh = new Set((data ?? []).filter((r) => Date.parse(r.fetched_at as string) >= Date.now() - FACTS_TTL_DAYS * DAY).map((r) => r.url as string));
  const pages = dfsConfigured() ? targets.filter((t) => !fresh.has(t.url)).length : 0;
  const { model } = aiConfig();
  // A write-up is about 7,000 tokens in and 1,200 out; up to two tries.
  const aiUsd = callCostUsd(model, { input_tokens: 14_000, output_tokens: 2_400 });
  return { pages, dataforseoUsd: Math.round(pageFactsCost(pages) * 100000) / 100000, aiUsd: Math.round(aiUsd * 10000) / 10000, date };
}

/** Read any missing or stale pages for one search, then rebuild its teardown for the latest run. */
export async function rebuildTeardown(keywordId: number, db: Db = createAdminClient()): Promise<{ costUsd: number }> {
  const date = await latestRunDate(db);
  if (!date) throw new Error('No rankings run yet.');
  const { data: k } = await db.from('seo_keyword').select('id, phrase, town, priority, target_page, location_code').eq('id', keywordId).maybeSingle();
  if (!k) throw new Error('No such search.');
  let cost = 0;
  if (dfsConfigured()) {
    const r = await runPageFacts(db, { keywordIds: [keywordId], limit: 12 });
    cost += r.costUsd;
  }
  const t = await buildTeardown(db, k as Kw, date);
  return { costUsd: Math.round((cost + t.costUsd) * 100000) / 100000 };
}
