import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { aiConfig, aiHeaders } from '@/lib/studio/ai';
import { parsePage } from './shared';
import { cleanDomain, isOurs, ourPlace, parseSerp, visibility, type LeagueRow, type SerpResult, type SerpSnapshot } from './rankings';

/**
 * Weekly Google rankings from DataForSEO (pay as you go, about a fifth of a US cent per search at the depth used here), and the
 * competitor analysis built on them. Credentials: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (the API password from the
 * DataForSEO dashboard). Stored in cms_kv: "seo-serp:YYYY-MM-DD" and "seo-competitors:YYYY-MM-DD".
 */

type Db = ReturnType<typeof createAdminClient>;
const API = 'https://api.dataforseo.com/v3';
const SERP_PREFIX = 'seo-serp:';
const COMP_PREFIX = 'seo-competitors:';
// v2: towns pinned to the right country (the first version searched "Newport" from the Isle of Wight).
const LOCATIONS_KEY = 'seo-serp-locations-v2';
const UK = { code: 2826, name: 'United Kingdom' };
const UA = 'Mozilla/5.0 (compatible; HeliaxisMonitor/1.0; +https://heliaxis.co.uk)';
const ukDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** A pasted value without the spaces, line breaks or quote marks that often come with it. */
const clean = (v: string | undefined) => String(v ?? '').trim().replace(/^["']|["']$/g, '').trim();
const creds = () => ({ login: clean(process.env.DATAFORSEO_LOGIN), password: clean(process.env.DATAFORSEO_PASSWORD) });

/** Or the "Base64 format" box from DataForSEO's API Access page (it has a copy button), which is login and password in one. */
const base64 = () => clean(process.env.DATAFORSEO_BASE64).replace(/^Basic\s+/i, '');

export const serpConfigured = () => {
  const c = creds();
  return !!(base64() || (c.login && c.password));
};

function auth() {
  const b = base64();
  if (b) return `Basic ${b}`;
  const c = creds();
  return 'Basic ' + Buffer.from(`${c.login}:${c.password}`).toString('base64');
}

/** The login being used, for the dashboard (from the Base64 value when that is what is set). */
function loginShown(): string {
  const b = base64();
  if (b) {
    try {
      return Buffer.from(b, 'base64').toString('utf8').split(':')[0] || '(Base64 value)';
    } catch {
      return '(Base64 value)';
    }
  }
  return creds().login;
}

export type SerpAccount = { ok: true; login: string; balanceUsd: number | null } | { ok: false; login: string; error: string };

/** Is the DataForSEO login accepted, and what is left on the account? (Free to ask; shown on the dashboard.) */
export async function serpAccount(): Promise<SerpAccount | null> {
  if (!serpConfigured()) return null;
  // Show who is signing in (the email, part hidden) so a wrong login is easy to spot.
  const login = loginShown().replace(/^(.{2}).*(@.*)$/, '$1…$2');
  try {
    const j = await dfs('/appendix/user_data', undefined, 8_000);
    const r = (j.tasks as Record<string, unknown>[] | undefined)?.[0]?.result as Record<string, unknown>[] | undefined;
    const money = r?.[0]?.money as Record<string, unknown> | undefined;
    return { ok: true, login, balanceUsd: typeof money?.balance === 'number' ? money.balance : null };
  } catch (e) {
    return { ok: false, login, error: e instanceof Error ? e.message : 'Could not reach DataForSEO' };
  }
}

async function dfs(path: string, body?: unknown, timeoutMs = 60_000): Promise<Record<string, unknown>> {
  const r = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || (j.status_code !== undefined && j.status_code !== 20000)) throw new Error(String(j.status_message ?? `DataForSEO ${r.status}`));
  return j;
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>, after?: (done: number) => Promise<unknown>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    if (after) await after(out.length).catch(() => null);
  }
  return out;
}

/* ── Locations: each town's DataForSEO location (free to look up, kept for 30 days) ── */

type Loc = { code: number; name: string };

/** Tracked towns in Wales (the rest are in England): several names exist in both, Newport above all. */
const WELSH = new Set(['Cardiff', 'Swansea', 'Newport', 'Bridgend', 'Cwmbran', 'Caerphilly', 'Vale of Glamorgan', 'Barry', 'Pontypridd', 'Pontypool', 'Tredegar', 'Chepstow']);
/** Where to search from when DataForSEO has no location for the town itself. */
const NEAREST: Record<string, string> = { Cwmbran: 'Newport', Caerphilly: 'Cardiff', 'Vale of Glamorgan': 'Cardiff', Barry: 'Cardiff', Pontypool: 'Newport', Weston: 'Bristol' };

async function townLocations(towns: string[], db: Db): Promise<Record<string, Loc>> {
  const { data } = await db.from('cms_kv').select('value, updated_at').eq('key', LOCATIONS_KEY).maybeSingle();
  const cached = parseKv<{ towns?: Record<string, Loc> }>(data?.value).towns ?? {};
  const fresh = data?.updated_at && Date.now() - Date.parse(data.updated_at) < 30 * 86_400_000;
  if (fresh && towns.every((t) => cached[t])) return cached;
  const j = await dfs('/serp/google/locations/gb');
  const list = (((j.tasks as Record<string, unknown>[] | undefined)?.[0]?.result as Record<string, unknown>[] | undefined) ?? []).map((x) => ({
    code: Number(x.location_code),
    name: String(x.location_name ?? ''),
    type: String(x.location_type ?? ''),
  }));
  const rank = (t: string) => ({ City: 0, Municipality: 1, County: 2, Region: 3 })[t] ?? 4;
  const find = (town: string) => {
    const country = WELSH.has(town) ? 'Wales' : 'England';
    return list
      .filter((l) => l.name.toLowerCase().startsWith(`${town.toLowerCase()},`) && l.name.endsWith(`,${country},United Kingdom`))
      .sort((a, b) => rank(a.type) - rank(b.type))[0];
  };
  const out: Record<string, Loc> = {};
  for (const town of towns) {
    // A town DataForSEO doesn't list is searched from the nearest one it does (Cwmbran from Newport, Caerphilly from Cardiff).
    const hit = find(town) ?? (NEAREST[town] ? find(NEAREST[town]) : undefined);
    out[town] = hit ? { code: hit.code, name: hit.name } : UK;
  }
  await db.from('cms_kv').upsert({ key: LOCATIONS_KEY, value: toKv({ towns: out }), updated_at: new Date().toISOString() });
  return out;
}

/* ── The weekly rankings run ─────────────────────────────────────────────────── */

async function oneSearch(k: { id: number; keyword: string; town: string }, loc: Loc): Promise<{ r: SerpResult; cost: number }> {
  const base = { keywordId: k.id, keyword: k.keyword, town: k.town, location: loc.name };
  let cost = 0;
  let lastError = 'Failed';
  // One retry: DataForSEO now and then answers "Internal SE Server Error" and succeeds a moment later.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Desktop: phone results come back as Google redirect links, which hide the real websites.
      const j = await dfs('/serp/google/organic/live/advanced', [{ keyword: k.keyword, location_code: loc.code, language_code: 'en', device: 'desktop', os: 'windows', depth: 20 }], 30_000);
      const task = (j.tasks as Record<string, unknown>[] | undefined)?.[0];
      cost += Number(task?.cost ?? 0);
      const items = ((task?.result as Record<string, unknown>[] | undefined)?.[0]?.items as unknown[] | undefined) ?? null;
      // A partial result (the second page could not be fetched) is still worth keeping.
      if (!task || (task.status_code !== 20000 && !items?.length)) throw new Error(String(task?.status_message ?? 'No result'));
      const { organic, localPack } = parseSerp(items ?? []);
      return { r: { ...base, organic, localPack, ours: ourPlace(organic, localPack) }, cost };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Failed';
    }
  }
  return { r: { ...base, organic: [], localPack: [], ours: { pos: null, url: null, pack: null }, error: lastError }, cost };
}

/** Check every active tracked search now and save the snapshot. Takes a minute or two. */
export async function runRankings(now = new Date(), db: Db = createAdminClient(), onProgress?: (done: number, total: number) => Promise<unknown>): Promise<SerpSnapshot> {
  if (!serpConfigured()) throw new Error('DataForSEO is not set up: add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.');
  const { data: kws } = await db.from('social_seo_keyword').select('id, keyword, town').eq('active', true).order('id');
  const keywords = (kws ?? []) as { id: number; keyword: string; town: string }[];
  if (!keywords.length) throw new Error('No searches to check: the keyword list is empty.');
  const locs = await townLocations([...new Set(keywords.map((k) => k.town))], db);
  // Twelve at a time keeps the whole run to a minute or two, well inside the five-minute limit.
  await onProgress?.(0, keywords.length);
  const done = await inBatches(keywords, 12, (k) => oneSearch(k, locs[k.town] ?? UK), (n) => onProgress?.(n, keywords.length) ?? Promise.resolve());
  const snap: SerpSnapshot = { id: ukDay(now), at: now.toISOString(), costUsd: Math.round(done.reduce((a, d) => a + d.cost, 0) * 10000) / 10000, results: done.map((d) => d.r) };
  await db.from('cms_kv').upsert({ key: SERP_PREFIX + snap.id, value: toKv(snap), updated_at: new Date().toISOString() });
  const failed = snap.results.filter((r) => r.error);
  if (failed.length) console.error(`SEO rankings: ${failed.length} of ${snap.results.length} searches failed, first: ${failed[0].error}`);
  return snap;
}

/* ── What is running: shown on the dashboard so a run never just says "Running…" ── */

const STATUS_KEY = 'seo-run-status';
export type RunStatus = { step: 'rankings' | 'competitors' | 'done' | 'failed'; startedAt: string; updatedAt: string; message?: string; done?: number; total?: number };
/** The site check's own status (a separate job, so a separate record). */
export type AuditStatus = { step: 'running' | 'done' | 'failed'; startedAt: string; updatedAt: string; message?: string };
const AUDIT_STATUS_KEY = 'seo-audit-status';

export async function readAuditStatus(db: Db = createAdminClient()): Promise<AuditStatus | null> {
  const { data } = await db.from('cms_kv').select('value').eq('key', AUDIT_STATUS_KEY).maybeSingle();
  const v = parseKv<AuditStatus>(data?.value);
  return v && v.step ? (v as AuditStatus) : null;
}

export async function setAuditStatus(s: AuditStatus, db: Db = createAdminClient()) {
  await db.from('cms_kv').upsert({ key: AUDIT_STATUS_KEY, value: toKv(s), updated_at: new Date().toISOString() });
}

export async function readRunStatus(db: Db = createAdminClient()): Promise<RunStatus | null> {
  const { data } = await db.from('cms_kv').select('value').eq('key', STATUS_KEY).maybeSingle();
  const v = parseKv<RunStatus>(data?.value);
  return v && v.step ? (v as RunStatus) : null;
}

async function setStatus(s: RunStatus, db: Db) {
  await db.from('cms_kv').upsert({ key: STATUS_KEY, value: toKv(s), updated_at: new Date().toISOString() });
}

/** Rankings, then the competitor analysis, recording each step (and any error) for the dashboard. */
export async function runRankingsAndCompetitors(db: Db = createAdminClient()): Promise<void> {
  const startedAt = new Date().toISOString();
  const at = () => new Date().toISOString();
  try {
    await setStatus({ step: 'rankings', startedAt, updatedAt: at() }, db);
    const snap = await runRankings(new Date(), db, (done, total) => setStatus({ step: 'rankings', startedAt, updatedAt: at(), done, total }, db));
    const failed = snap.results.filter((r) => r.error);
    if (failed.length === snap.results.length) throw new Error(`Every search failed at DataForSEO: ${failed[0]?.error ?? 'unknown error'}`);
    await setStatus({ step: 'competitors', startedAt, updatedAt: at() }, db);
    await runCompetitorAnalysis(new Date(), db);
    await setStatus({ step: 'done', startedAt, updatedAt: at(), message: failed.length ? `${failed.length} of ${snap.results.length} searches could not be checked.` : undefined }, db);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed';
    console.error('SEO rankings run failed:', message);
    await setStatus({ step: 'failed', startedAt, updatedAt: at(), message }, db).catch(() => null);
  }
}

/** The latest snapshots, newest first. */
export async function recentRankings(n = 12, db: Db = createAdminClient()): Promise<SerpSnapshot[]> {
  const { data } = await db.from('cms_kv').select('value').like('key', `${SERP_PREFIX}%`).order('key', { ascending: false }).limit(n);
  return (data ?? []).map((r) => parseKv<SerpSnapshot>(r.value) as SerpSnapshot).filter((s) => s && Array.isArray(s.results));
}

/* ── Competitor analysis: who leads, and what their pages do that ours don't ─────────────────────────── */

export type PageFacts = {
  url: string;
  ok: boolean;
  title: string;
  description: string;
  h1: number;
  words: number;
  schema: string[];
  /** Links on the page to pages named after a tracked town ("/solar-panels-cardiff"). */
  townLinks: number;
};

export type CompetitorReport = {
  domain: string;
  share: number;
  searches: number;
  top3: number;
  avgPos: number;
  towns: string[];
  pages: PageFacts[];
  better: string[];
  summary: string;
};

export type CompetitorAnalysis = {
  id: string;
  at: string;
  basedOn: string;
  ours: { share: number; searches: number; top3: number; avgPos: number | null; pages: PageFacts[] };
  competitors: CompetitorReport[];
  actions: { title: string; why: string; effort: 'small' | 'medium' | 'large' }[];
  note?: string;
};

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    return { status: r.status, body: (await r.text()).slice(0, 1_500_000) };
  } catch {
    return { status: 0, body: '' };
  }
}

/** Robots.txt allows a general crawler on this path (a simple reading: the "*" group's Disallow lines). */
async function allowed(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const r = await fetchText(`${u.origin}/robots.txt`);
    if (r.status !== 200) return true;
    let inStar = false;
    const rules: string[] = [];
    for (const line of r.body.split(/\r?\n/)) {
      const [k, ...v] = line.split(':');
      const key = k.trim().toLowerCase();
      const val = v.join(':').trim();
      if (key === 'user-agent') inStar = val === '*';
      else if (inStar && key === 'disallow' && val) rules.push(val);
    }
    return !rules.some((p) => u.pathname.startsWith(p));
  } catch {
    return true;
  }
}

async function pageFacts(url: string, towns: string[]): Promise<PageFacts> {
  const empty: PageFacts = { url, ok: false, title: '', description: '', h1: 0, words: 0, schema: [], townLinks: 0 };
  if (!(await allowed(url))) return empty;
  const r = await fetchText(url);
  if (r.status !== 200 || !r.body) return empty;
  const p = parsePage(r.body, new URL(url).pathname, r.status, 0);
  const slugs = towns.map((t) => t.toLowerCase().replace(/[^a-z]+/g, '-'));
  const hrefs = [...r.body.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1].toLowerCase());
  const townLinks = new Set(hrefs.filter((h) => slugs.some((s) => h.includes(s)))).size;
  return { url, ok: true, title: p.title, description: p.description, h1: p.h1, words: p.words, schema: [...new Set(p.jsonld)], townLinks };
}

/** Look at the leading installers' best pages next to ours and write what they do better (facts first, then the writing assistant). */
export async function runCompetitorAnalysis(now = new Date(), db: Db = createAdminClient()): Promise<CompetitorAnalysis> {
  const [snap] = await recentRankings(1, db);
  if (!snap) throw new Error('No rankings yet: run the rankings first.');
  const towns = [...new Set(snap.results.map((r) => r.town))];
  const league = visibility(snap);
  const us = league.find((x) => isOurs(x.domain));
  const leaders = league.filter((x) => !isOurs(x.domain)).slice(0, 6);

  const pagesFor = async (row: LeagueRow) => {
    const home = `https://${row.domain}/`;
    const urls = [...new Set([home, ...row.urls.slice(0, 2).map((u) => u.url)])].slice(0, 3);
    return Promise.all(urls.map((u) => pageFacts(u, towns)));
  };
  const ourUrls = [...new Set(['https://heliaxis.co.uk/', 'https://heliaxis.co.uk/solar-panels', ...(us?.urls.slice(0, 1).map((u) => u.url) ?? [])])];
  const [ourPages, theirPages] = await Promise.all([Promise.all(ourUrls.map((u) => pageFacts(u, towns))), Promise.all(leaders.map(pagesFor))]);

  const ours = { share: us?.share ?? 0, searches: us?.searches ?? 0, top3: us?.top3 ?? 0, avgPos: us?.avgPos ?? null, pages: ourPages };
  const competitors: CompetitorReport[] = leaders.map((l, i) => ({
    domain: l.domain,
    share: l.share,
    searches: l.searches,
    top3: l.top3,
    avgPos: l.avgPos,
    towns: l.towns,
    pages: theirPages[i],
    better: [],
    summary: '',
  }));

  const written = await writeAnalysis(ours, competitors, snap.results.length, towns);
  const out: CompetitorAnalysis = {
    id: ukDay(now),
    at: now.toISOString(),
    basedOn: snap.id,
    ours,
    competitors: competitors.map((c) => ({ ...c, better: written?.byDomain[c.domain]?.better ?? [], summary: written?.byDomain[c.domain]?.summary ?? '' })),
    actions: written?.actions ?? [],
    note: written ? undefined : 'The writing assistant was not available, so only the figures are shown.',
  };
  await db.from('cms_kv').upsert({ key: COMP_PREFIX + out.id, value: toKv(out), updated_at: new Date().toISOString() });
  return out;
}

export async function latestCompetitorAnalysis(db: Db = createAdminClient()): Promise<CompetitorAnalysis | null> {
  const { data } = await db.from('cms_kv').select('value').like('key', `${COMP_PREFIX}%`).order('key', { ascending: false }).limit(1);
  const v = data?.[0] ? (parseKv<CompetitorAnalysis>(data[0].value) as CompetitorAnalysis) : null;
  return v && Array.isArray(v.competitors) ? v : null;
}

const slim = (p: PageFacts) => (p.ok ? { url: p.url, title: p.title, description: p.description, words: p.words, schema: p.schema, townLinks: p.townLinks } : { url: p.url, unreadable: true });

async function writeAnalysis(
  ours: CompetitorAnalysis['ours'],
  comps: CompetitorReport[],
  searches: number,
  towns: string[],
): Promise<{ byDomain: Record<string, { better: string[]; summary: string }>; actions: CompetitorAnalysis['actions'] } | null> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey || !comps.length) return null;
  const facts = {
    searchesTracked: searches,
    towns,
    heliaxis: { ...ours, pages: ours.pages.map(slim) },
    competitors: comps.map((c) => ({ domain: c.domain, visibilitySharePct: c.share, searchesInTop20: c.searches, searchesInTop3: c.top3, avgPos: c.avgPos, towns: c.towns, pages: c.pages.map(slim) })),
  };
  const prompt = `You are an SEO analyst for Heliaxis, an MCS-certified installer of solar panels, batteries, heat pumps and EV chargers in South Wales and the South West of England.

Below are FACTS from this week's Google results for ${searches} local searches (phone, each from its own town) and from reading each site's pages. "visibilitySharePct" is the share of likely clicks across all searches. "townLinks" counts links to pages named after a tracked town. "schema" lists structured-data types on the page.

Rules: use ONLY these facts. Do not invent reviews, prices, years in business or anything not shown. If a fact is missing (a page could not be read), say less rather than guess. British English, plain, short. No emoji.

For each competitor, write "better": 2 to 4 short points on what their pages or rankings show that Heliaxis's do not (for example more town pages, more words on the ranking page, FAQ or LocalBusiness markup, ranking in more towns), and "summary": one sentence.
Then write "actions": the 5 changes most likely to move Heliaxis up, each with "title" (imperative, under 70 characters), "why" (one sentence citing the facts) and "effort" ("small", "medium" or "large").

FACTS:
${JSON.stringify(facts).slice(0, 24000)}

Return ONLY JSON: {"competitors":[{"domain":"","better":[""],"summary":""}],"actions":[{"title":"","why":"","effort":"small"}]}`;
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: aiHeaders(apiKey),
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1800, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const j = JSON.parse(String(d?.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()) as {
      competitors?: { domain?: string; better?: unknown[]; summary?: string }[];
      actions?: { title?: string; why?: string; effort?: string }[];
    };
    const byDomain: Record<string, { better: string[]; summary: string }> = {};
    for (const c of j.competitors ?? []) {
      if (!c.domain) continue;
      byDomain[cleanDomain(c.domain)] = { better: (c.better ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 4), summary: String(c.summary ?? '').trim() };
    }
    const actions = (j.actions ?? [])
      .map((a) => ({ title: String(a.title ?? '').trim(), why: String(a.why ?? '').trim(), effort: (['small', 'medium', 'large'].includes(String(a.effort)) ? a.effort : 'medium') as 'small' | 'medium' | 'large' }))
      .filter((a) => a.title)
      .slice(0, 5);
    return { byDomain, actions };
  } catch {
    return null;
  }
}
