/**
 * Umami analytics (https://umami.is) — free via Share URL (no paid API key).
 *
 * NEXT_PUBLIC_UMAMI_WEBSITE_ID / SCRIPT_URL / SHARE_URL / TRACK_DEV
 * Optional: UMAMI_API_BASE_URL, UMAMI_API_KEY
 */

export function getUmamiConfig() {
  const websiteId = (process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '').trim();
  const scriptUrl = (
    process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js'
  ).trim();
  const domains = (process.env.NEXT_PUBLIC_UMAMI_DOMAINS || '').trim();
  const shareUrl = (process.env.NEXT_PUBLIC_UMAMI_SHARE_URL || '').trim();
  const dashboardUrl = (
    process.env.NEXT_PUBLIC_UMAMI_DASHBOARD_URL || 'https://cloud.umami.is'
  ).trim();
  const trackDev = process.env.NEXT_PUBLIC_UMAMI_TRACK_DEV === '1';
  const apiKey = (process.env.UMAMI_API_KEY || '').trim();
  const apiBase = (process.env.UMAMI_API_BASE_URL || 'https://gateway-us.umami.is/api').replace(
    /\/$/,
    '',
  );
  const shareId = extractShareId(shareUrl);

  return {
    websiteId,
    scriptUrl,
    domains,
    shareUrl,
    shareId,
    dashboardUrl,
    trackDev,
    apiKey,
    apiBase,
    configured: Boolean(websiteId && scriptUrl),
    canFetchStats: Boolean(shareId || (websiteId && apiKey)),
  };
}

export function extractShareId(shareUrl: string): string | null {
  const m = String(shareUrl || '').match(/\/share\/([A-Za-z0-9_-]+)/);
  return m?.[1] || null;
}

export type UmamiRange = '24h' | '7d' | '30d';

export type UmamiMetricRow = { x: string; y: number };

export type UmamiStatBlock = {
  visitors: number;
  visits: number;
  pageviews: number;
  bounces: number;
  totaltime: number;
  bounceRate: number;
  avgDurationSec: number;
};

export type UmamiDeltas = {
  visitors: number | null;
  visits: number | null;
  pageviews: number | null;
  bounceRate: number | null;
  avgDurationSec: number | null;
};

export type UmamiDashboardData = {
  range: UmamiRange;
  startAt: number;
  endAt: number;
  active: number;
  stats: UmamiStatBlock;
  deltas: UmamiDeltas;
  series: { label: string; views: number; sessions: number; at: number }[];
  paths: UmamiMetricRow[];
  urls: UmamiMetricRow[];
  referrers: UmamiMetricRow[];
  browsers: UmamiMetricRow[];
  os: UmamiMetricRow[];
  devices: UmamiMetricRow[];
  countries: UmamiMetricRow[];
  regions: UmamiMetricRow[];
  cities: UmamiMetricRow[];
  /** 7×24 grid: [dow 0=Sun][hour] = view count */
  heatmap: number[][];
};

function rangeWindow(range: UmamiRange): { startAt: number; endAt: number; unit: string; ms: number } {
  const endAt = Date.now();
  if (range === '24h') {
    const ms = 24 * 60 * 60 * 1000;
    return { startAt: endAt - ms, endAt, unit: 'hour', ms };
  }
  if (range === '7d') {
    const ms = 7 * 24 * 60 * 60 * 1000;
    return { startAt: endAt - ms, endAt, unit: 'day', ms };
  }
  const ms = 30 * 24 * 60 * 60 * 1000;
  return { startAt: endAt - ms, endAt, unit: 'day', ms };
}

function numVal(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'value' in v) {
    const n = Number((v as { value: unknown }).value);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asRows(raw: unknown): UmamiMetricRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const x = String(r.x ?? r.name ?? '');
      const y = numVal(r.y ?? r.count ?? r.value);
      if (!x) return null;
      return { x, y };
    })
    .filter((r): r is UmamiMetricRow => Boolean(r))
    .sort((a, b) => b.y - a.y);
}

function parseStats(raw: unknown): UmamiStatBlock {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const visitors = numVal(s.visitors);
  const visits = numVal(s.visits);
  const pageviews = numVal(s.pageviews);
  const bounces = numVal(s.bounces);
  const totaltime = numVal(s.totaltime);
  return {
    visitors,
    visits,
    pageviews,
    bounces,
    totaltime,
    bounceRate: visits > 0 ? Math.round((bounces / visits) * 1000) / 10 : 0,
    avgDurationSec: visits > 0 ? Math.round(totaltime / visits) : 0,
  };
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

type AuthMode =
  | { kind: 'share'; token: string; websiteId: string }
  | { kind: 'apiKey'; apiKey: string; websiteId: string };

async function resolveAuth(
  apiBase: string,
  shareId: string | null,
  websiteId: string,
  apiKey: string,
): Promise<AuthMode> {
  if (shareId) {
    const r = await fetch(`${apiBase}/share/${encodeURIComponent(shareId)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HeliaxisAnalytics/1.0',
      },
      next: { revalidate: 300 },
    });
    if (!r.ok) {
      throw new Error(`Could not resolve share link (${r.status})`);
    }
    const data = (await r.json()) as { token?: string; websiteId?: string };
    if (!data.token || !data.websiteId) {
      throw new Error('Share link response missing token');
    }
    return { kind: 'share', token: data.token, websiteId: data.websiteId };
  }
  if (apiKey && websiteId) {
    return { kind: 'apiKey', apiKey, websiteId };
  }
  throw new Error('Set NEXT_PUBLIC_UMAMI_SHARE_URL (free) to load analytics');
}

async function umamiGet(path: string, apiBase: string, auth: AuthMode) {
  const url = `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'HeliaxisAnalytics/1.0',
  };
  if (auth.kind === 'share') {
    headers['x-umami-share-token'] = auth.token;
    headers['x-umami-share-context'] = '1';
  } else {
    headers['x-umami-api-key'] = auth.apiKey;
  }
  const r = await fetch(url, { headers, next: { revalidate: 60 } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(text.slice(0, 200) || `Umami API ${r.status}`);
  }
  return r.json();
}

function emptyHeatmap(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

function buildHeatmap(hourly: { x?: string | number; y?: number }[]): number[][] {
  const grid = emptyHeatmap();
  for (const row of hourly) {
    const d = new Date(typeof row.x === 'number' ? row.x : String(row.x));
    if (Number.isNaN(d.getTime())) continue;
    grid[d.getDay()][d.getHours()] += numVal(row.y);
  }
  return grid;
}

/** Fetch stats for the native Heliaxis analytics UI (free via Share URL). */
export async function fetchUmamiDashboard(range: UmamiRange = '24h'): Promise<UmamiDashboardData | null> {
  const { websiteId, apiKey, apiBase, shareId, canFetchStats } = getUmamiConfig();
  if (!canFetchStats) return null;

  const auth = await resolveAuth(apiBase, shareId, websiteId, apiKey);
  const wid = auth.websiteId;
  const { startAt, endAt, unit, ms } = rangeWindow(range);
  const prevStart = startAt - ms;
  const prevEnd = startAt;
  const q = `startAt=${startAt}&endAt=${endAt}`;
  const pq = `startAt=${prevStart}&endAt=${prevEnd}`;
  const tz = encodeURIComponent('Asia/Karachi');
  const heatStart = endAt - 7 * 24 * 60 * 60 * 1000;

  const [
    statsRaw,
    prevStatsRaw,
    pageviewsRaw,
    activeRaw,
    paths,
    urls,
    referrers,
    browsers,
    os,
    devices,
    countries,
    regions,
    cities,
    heatRaw,
  ] = await Promise.all([
    umamiGet(`/websites/${wid}/stats?${q}`, apiBase, auth),
    umamiGet(`/websites/${wid}/stats?${pq}`, apiBase, auth).catch(() => null),
    umamiGet(`/websites/${wid}/pageviews?${q}&unit=${unit}&timezone=${tz}`, apiBase, auth),
    umamiGet(`/websites/${wid}/active`, apiBase, auth).catch(() => ({ x: 0 })),
    umamiGet(`/websites/${wid}/metrics?${q}&type=path&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=url&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=referrer&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=browser&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=os&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=device&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=country&limit=20`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=region&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(`/websites/${wid}/metrics?${q}&type=city&limit=10`, apiBase, auth).catch(() => []),
    umamiGet(
      `/websites/${wid}/pageviews?startAt=${heatStart}&endAt=${endAt}&unit=hour&timezone=${tz}`,
      apiBase,
      auth,
    ).catch(() => null),
  ]);

  const stats = parseStats(statsRaw);
  const prev = prevStatsRaw ? parseStats(prevStatsRaw) : null;

  const viewsSeries = Array.isArray(pageviewsRaw?.pageviews)
    ? pageviewsRaw.pageviews
    : Array.isArray(pageviewsRaw)
      ? pageviewsRaw
      : [];
  const sessionsSeries = Array.isArray(pageviewsRaw?.sessions) ? pageviewsRaw.sessions : [];

  const series = viewsSeries.map((row: { x?: string | number; y?: number }, i: number) => {
    const x = row?.x;
    const at = typeof x === 'number' ? x : Date.parse(String(x));
    let label = String(x ?? '');
    const d = new Date(Number.isFinite(at) ? at : String(x));
    if (!Number.isNaN(d.getTime())) {
      label =
        unit === 'hour'
          ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    return {
      label,
      views: numVal(row?.y),
      sessions: numVal(sessionsSeries[i]?.y),
      at: Number.isFinite(at) ? at : i,
    };
  });

  const heatViews = Array.isArray(heatRaw?.pageviews)
    ? heatRaw.pageviews
    : Array.isArray(heatRaw)
      ? heatRaw
      : viewsSeries;

  const active =
    typeof activeRaw === 'number'
      ? activeRaw
      : numVal(activeRaw?.x ?? activeRaw?.visitors ?? activeRaw?.total);

  return {
    range,
    startAt,
    endAt,
    active,
    stats,
    deltas: {
      visitors: prev ? pctDelta(stats.visitors, prev.visitors) : null,
      visits: prev ? pctDelta(stats.visits, prev.visits) : null,
      pageviews: prev ? pctDelta(stats.pageviews, prev.pageviews) : null,
      bounceRate: prev ? pctDelta(stats.bounceRate, prev.bounceRate) : null,
      avgDurationSec: prev ? pctDelta(stats.avgDurationSec, prev.avgDurationSec) : null,
    },
    series,
    paths: asRows(paths),
    urls: asRows(urls),
    referrers: asRows(referrers),
    browsers: asRows(browsers),
    os: asRows(os),
    devices: asRows(devices),
    countries: asRows(countries),
    regions: asRows(regions),
    cities: asRows(cities),
    heatmap: buildHeatmap(heatViews),
  };
}

/** ISO country code → display name (subset + passthrough). */
export const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan',
  AL: 'Albania',
  DZ: 'Algeria',
  AR: 'Argentina',
  AU: 'Australia',
  AT: 'Austria',
  BD: 'Bangladesh',
  BE: 'Belgium',
  BR: 'Brazil',
  CA: 'Canada',
  CN: 'China',
  CO: 'Colombia',
  CZ: 'Czechia',
  DK: 'Denmark',
  EG: 'Egypt',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  GR: 'Greece',
  HK: 'Hong Kong',
  HU: 'Hungary',
  IN: 'India',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IT: 'Italy',
  JP: 'Japan',
  KE: 'Kenya',
  MY: 'Malaysia',
  MX: 'Mexico',
  NL: 'Netherlands',
  NZ: 'New Zealand',
  NG: 'Nigeria',
  NO: 'Norway',
  PK: 'Pakistan',
  PH: 'Philippines',
  PL: 'Poland',
  PT: 'Portugal',
  QA: 'Qatar',
  RO: 'Romania',
  RU: 'Russia',
  SA: 'Saudi Arabia',
  SG: 'Singapore',
  ZA: 'South Africa',
  KR: 'South Korea',
  ES: 'Spain',
  SE: 'Sweden',
  CH: 'Switzerland',
  TW: 'Taiwan',
  TH: 'Thailand',
  TR: 'Turkey',
  AE: 'United Arab Emirates',
  GB: 'United Kingdom',
  US: 'United States',
  VN: 'Vietnam',
};

/** Approximate [lng, lat] for map pins. */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  AF: [67.7, 33.9],
  AL: [20.2, 41.2],
  DZ: [1.7, 28.0],
  AR: [-63.6, -38.4],
  AU: [133.8, -25.3],
  AT: [14.6, 47.5],
  BD: [90.4, 23.7],
  BE: [4.5, 50.5],
  BR: [-51.9, -14.2],
  CA: [-106.3, 56.1],
  CN: [104.2, 35.9],
  CO: [-74.3, 4.6],
  CZ: [15.5, 49.8],
  DK: [9.5, 56.3],
  EG: [30.8, 26.8],
  FI: [25.7, 61.9],
  FR: [2.2, 46.2],
  DE: [10.5, 51.2],
  GR: [21.8, 39.1],
  HK: [114.1, 22.4],
  HU: [19.5, 47.2],
  IN: [78.9, 20.6],
  ID: [113.9, -0.8],
  IE: [-8.2, 53.4],
  IL: [34.9, 31.0],
  IT: [12.6, 41.9],
  JP: [138.3, 36.2],
  KE: [37.9, -0.0],
  MY: [101.9, 4.2],
  MX: [-102.6, 23.6],
  NL: [5.3, 52.1],
  NZ: [174.9, -40.9],
  NG: [8.7, 9.1],
  NO: [8.5, 60.5],
  PK: [69.3, 30.4],
  PH: [121.8, 12.9],
  PL: [19.1, 51.9],
  PT: [-8.2, 39.4],
  QA: [51.2, 25.4],
  RO: [24.9, 45.9],
  RU: [105.3, 61.5],
  SA: [45.1, 23.9],
  SG: [103.8, 1.4],
  ZA: [22.9, -30.6],
  KR: [127.8, 35.9],
  ES: [-3.7, 40.5],
  SE: [18.6, 60.1],
  CH: [8.2, 46.8],
  TW: [120.9, 23.7],
  TH: [100.9, 15.9],
  TR: [35.2, 39.0],
  AE: [53.8, 23.4],
  GB: [-3.4, 55.4],
  US: [-95.7, 37.1],
  VN: [108.3, 14.1],
};

export function countryLabel(code: string): string {
  const c = code.toUpperCase();
  return COUNTRY_NAMES[c] || code;
}
