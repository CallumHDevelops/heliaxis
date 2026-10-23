import 'server-only';
import { createSign } from 'crypto';
import { auditHtml, fetchable, isOurs, parseSerp, town, type GscRow, type PageAudit, type SerpResult } from './shared';

/**
 * Where the CMS report's numbers come from. Each is optional; the report says what's missing.
 *  - Google Search Console (free): what we really rank for, clicks, impressions, countries, devices.
 *    GSC_SERVICE_ACCOUNT holds a Google service-account JSON (or base64), falling back to
 *    FIREBASE_SERVICE_ACCOUNT; that account's email is added as a user on the Search Console property.
 *    GSC_SITE_URL is the property, "sc-domain:heliaxis.co.uk" by default.
 *  - DataForSEO (pay as you go): Google's results town by town with the map pack, the keywords a domain
 *    ranks for UK-wide, and the domains that compete with ours. DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.
 *  - The pages themselves, fetched to compare what's on them.
 */

// ── DataForSEO ──────────────────────────────────────────────────────────────

export const dataForSeoConfigured = () => !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);

const UK = 2826;

type DfsTask<T> = { status_code?: number; status_message?: string; cost?: number; result?: T[] | null };
type DfsReply<T> = { status_code?: number; status_message?: string; tasks?: DfsTask<T>[] };

async function dfs<T>(path: string, task: Record<string, unknown>): Promise<{ result: T | null; cost: number }> {
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => null)) as DfsReply<T> | null;
  if (!res.ok || !body) throw new Error(`DataForSEO ${res.status}${body?.status_message ? `: ${body.status_message}` : ''}`);
  if (body.status_code !== 20000) throw new Error(`DataForSEO: ${body.status_message || body.status_code}`);
  const t = body.tasks?.[0];
  if (!t || t.status_code !== 20000) throw new Error(`DataForSEO: ${t?.status_message || 'no result'}`);
  return { result: t.result?.[0] ?? null, cost: Number(t.cost) || 0 };
}

/** Google's top 20 for one search as seen from one town, with the map pack. */
export async function googleSerp(keyword: string, location: string): Promise<SerpResult & { cost: number }> {
  const { result, cost } = await dfs<{ items?: Record<string, unknown>[]; item_types?: string[] }>('serp/google/organic/live/advanced', {
    keyword,
    location_name: location,
    language_code: 'en',
    device: 'desktop',
    depth: 20,
  });
  return { ...parseSerp(keyword, location, result), cost };
}

export type RankedKeyword = { keyword: string; pos: number; volume: number | null; url: string; etv: number | null; difficulty: number | null };

/** What heliaxis.co.uk ranks for in Google UK (DataForSEO's index, refreshed weekly), biggest first. */
export async function rankedKeywords(domain: string, limit = 200): Promise<{ total: number; items: RankedKeyword[]; cost: number }> {
  type Item = {
    keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number } };
    ranked_serp_element?: { keyword_difficulty?: number; serp_item?: { rank_group?: number; url?: string; etv?: number } };
  };
  const { result, cost } = await dfs<{ total_count?: number; items?: Item[] }>('dataforseo_labs/google/ranked_keywords/live', {
    target: domain,
    location_code: UK,
    language_code: 'en',
    limit,
    item_types: ['organic'],
    order_by: ['ranked_serp_element.serp_item.etv,desc'],
  });
  const items = (result?.items ?? []).map((i) => ({
    keyword: String(i.keyword_data?.keyword || ''),
    pos: Number(i.ranked_serp_element?.serp_item?.rank_group) || 0,
    volume: i.keyword_data?.keyword_info?.search_volume ?? null,
    url: String(i.ranked_serp_element?.serp_item?.url || ''),
    etv: i.ranked_serp_element?.serp_item?.etv ?? null,
    difficulty: i.ranked_serp_element?.keyword_difficulty ?? null,
  }));
  return { total: Number(result?.total_count) || items.length, items: items.filter((i) => i.keyword), cost };
}

export type DomainMetrics = { keywords: number; etv: number; top3: number; top10: number };
type Metrics = { count?: number; etv?: number; pos_1?: number; pos_2_3?: number; pos_4_10?: number };
const metricsOf = (m: Metrics | undefined): DomainMetrics => ({
  keywords: Number(m?.count) || 0,
  etv: Math.round(Number(m?.etv) || 0),
  top3: (Number(m?.pos_1) || 0) + (Number(m?.pos_2_3) || 0),
  top10: (Number(m?.pos_1) || 0) + (Number(m?.pos_2_3) || 0) + (Number(m?.pos_4_10) || 0),
});

export type Competitor = { domain: string; shared: number; avgPos: number; metrics: DomainMetrics };

/** Domains that rank for the same keywords as ours in Google UK, most overlap first. */
export async function competitorDomains(domain: string, limit = 20): Promise<{ items: Competitor[]; cost: number }> {
  type Item = { domain?: string; avg_position?: number; intersections?: number; full_domain_metrics?: { organic?: Metrics } };
  const { result, cost } = await dfs<{ items?: Item[] }>('dataforseo_labs/google/competitors_domain/live', {
    target: domain,
    location_code: UK,
    language_code: 'en',
    limit,
    exclude_top_domains: true,
    item_types: ['organic'],
  });
  const items = (result?.items ?? [])
    .filter((i) => i.domain && !isOurs(i.domain))
    .map((i) => ({
      domain: String(i.domain),
      shared: Number(i.intersections) || 0,
      avgPos: Math.round((Number(i.avg_position) || 0) * 10) / 10,
      metrics: metricsOf(i.full_domain_metrics?.organic),
    }));
  return { items, cost };
}

/** One domain's size in Google UK: keywords ranked, estimated monthly visits, top-3 and top-10 places. */
export async function domainOverview(domain: string): Promise<{ metrics: DomainMetrics | null; cost: number }> {
  const { result, cost } = await dfs<{ items?: { metrics?: { organic?: Metrics } }[] }>('dataforseo_labs/google/domain_rank_overview/live', {
    target: domain,
    location_code: UK,
    language_code: 'en',
  });
  const m = result?.items?.[0]?.metrics?.organic;
  return { metrics: m ? metricsOf(m) : null, cost };
}

// ── Google Search Console ───────────────────────────────────────────────────

type ServiceAccount = { client_email: string; private_key: string };

function gscAccount(): ServiceAccount | null {
  const raw = (process.env.GSC_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    return json.client_email && json.private_key ? { client_email: json.client_email, private_key: json.private_key } : null;
  } catch {
    return null;
  }
}

export const gscConfigured = () => !!gscAccount();
export const gscEmail = () => gscAccount()?.client_email ?? null;
export const gscSite = () => process.env.GSC_SITE_URL || 'sc-domain:heliaxis.co.uk';

async function gscToken(sa: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in: ${body.error_description || body.error || res.status}`);
  return body.access_token;
}

/** Search Console's search analytics for the property, grouped by `dimensions`. */
export async function gscQuery(opts: { start: string; end: string; dimensions: string[]; rowLimit?: number; token?: string }) {
  const sa = gscAccount();
  if (!sa) throw new Error('Search Console is not connected');
  const token = opts.token ?? (await gscToken(sa));
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSite())}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: opts.start, endDate: opts.end, dimensions: opts.dimensions, rowLimit: opts.rowLimit ?? 250, type: 'web' }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { rows?: GscRow[]; error?: { message?: string } };
  if (!res.ok) {
    const why = body.error?.message || String(res.status);
    throw new Error(
      res.status === 403
        ? `Search Console refused access. Add ${sa.client_email} as a user on ${gscSite()} (Settings → Users and permissions), and switch on the Search Console API in its Google Cloud project. (${why})`
        : `Search Console: ${why}`
    );
  }
  return { rows: body.rows ?? [], token };
}

// ── The pages themselves ────────────────────────────────────────────────────

/** Fetch a page and read its on-page signals. Never throws: a failure is kept on the audit. */
export async function auditPage(url: string, info: { ours: boolean; keyword: string; pos: number | null }, towns: string[]): Promise<PageAudit> {
  const base: PageAudit = { url, ...info, ok: false };
  if (!fetchable(url)) return { ...base, error: 'Not a public web address' };
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HeliaxisReport/1.0; +https://heliaxis.co.uk)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    // A redirect can land anywhere: only read it if it's still a public address.
    if (!fetchable(res.url || url)) return { ...base, error: 'Redirected somewhere private' };
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/html/i.test(type)) return { ...base, status: res.status, error: res.ok ? 'Not a web page' : `HTTP ${res.status}` };
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        html += dec.decode(value, { stream: true });
        if (size > 2_000_000) {
          await reader.cancel();
          break;
        }
      }
    }
    const ms = Date.now() - started;
    return { ...base, ...auditHtml(html, url, towns), ok: true, status: res.status, ms, kb: Math.round(html.length / 1024) };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message.slice(0, 200) : 'Could not read it' };
  }
}

export const townsOf = (locations: string[]) => [...new Set(['Newport', 'Cardiff', 'Swansea', 'Bristol', 'South Wales', 'Wales', ...locations.map(town)])];
