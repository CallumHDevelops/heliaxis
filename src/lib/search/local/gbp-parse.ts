/**
 * Google Business Profile Performance API responses (spec §4.2) into rows for gbp_daily and gbp_keyword_monthly, and the
 * month-on-month view. Pure.
 */

export const GBP_METRICS = [
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
  'BUSINESS_CONVERSATIONS',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
] as const;

type GDate = { year?: number; month?: number; day?: number };
const iso = (d: GDate | undefined) => (d?.year && d.month && d.day ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null);

export type DailyRow = { date: string; metric: string; value: number };

/** fetchMultiDailyMetricsTimeSeries → one row per metric per day. Google leaves out `value` on days with none: 0. */
export function parseDailyMetrics(j: unknown): DailyRow[] {
  const out: DailyRow[] = [];
  const multi = ((j as { multiDailyMetricTimeSeries?: unknown[] } | null)?.multiDailyMetricTimeSeries ?? []) as { dailyMetricTimeSeries?: unknown[] }[];
  for (const m of multi) {
    for (const s of (m?.dailyMetricTimeSeries ?? []) as { dailyMetric?: string; timeSeries?: { datedValues?: { date?: GDate; value?: string | number }[] } }[]) {
      if (!s?.dailyMetric) continue;
      for (const dv of s.timeSeries?.datedValues ?? []) {
        const date = iso(dv.date);
        if (!date) continue;
        const v = Number(dv.value ?? 0);
        out.push({ date, metric: s.dailyMetric, value: Number.isFinite(v) ? Math.round(v) : 0 });
      }
    }
  }
  return out;
}

export type KeywordRow = { keyword: string; impressions: number | null };

/** searchkeywords.impressions.monthly → keyword rows. Below Google's threshold the count is hidden: null ("fewer than 15"). */
export function parseKeywords(j: unknown): { rows: KeywordRow[]; next: string | null } {
  const o = (j ?? {}) as { searchKeywordsCounts?: { searchKeyword?: string; insightsValue?: { value?: string | number; threshold?: string | number } }[]; nextPageToken?: string };
  const rows = (o.searchKeywordsCounts ?? [])
    .filter((r) => r?.searchKeyword)
    .map((r) => {
      const v = r.insightsValue?.value;
      return { keyword: String(r.searchKeyword).trim().toLowerCase(), impressions: v === undefined || v === null || v === '' ? null : Number(v) };
    });
  // The same keyword can come back twice (case): keep the bigger count.
  const by = new Map<string, KeywordRow>();
  for (const r of rows) {
    const cur = by.get(r.keyword);
    if (!cur || (r.impressions ?? -1) > (cur.impressions ?? -1)) by.set(r.keyword, r);
  }
  return { rows: [...by.values()], next: o.nextPageToken || null };
}

export type MonthTotals = { month: string; calls: number; website: number; directions: number; impressions: number; days: number };

/** Daily rows into calendar months (newest first): calls, website clicks, direction requests, all impressions. */
export function monthTotals(rows: DailyRow[]): MonthTotals[] {
  const by = new Map<string, MonthTotals & { dates: Set<string> }>();
  for (const r of rows) {
    const month = r.date.slice(0, 7);
    const e = by.get(month) ?? { month, calls: 0, website: 0, directions: 0, impressions: 0, days: 0, dates: new Set<string>() };
    e.dates.add(r.date);
    if (r.metric === 'CALL_CLICKS') e.calls += r.value;
    else if (r.metric === 'WEBSITE_CLICKS') e.website += r.value;
    else if (r.metric === 'BUSINESS_DIRECTION_REQUESTS') e.directions += r.value;
    else if (r.metric.startsWith('BUSINESS_IMPRESSIONS_')) e.impressions += r.value;
    by.set(month, e);
  }
  return [...by.values()].map(({ dates, ...e }) => ({ ...e, days: dates.size })).sort((a, b) => b.month.localeCompare(a.month));
}

/** Months as "YYYY-MM" from `from` back `n` months (the month of `from` excluded). */
export function lastFullMonths(from: string, n: number): string[] {
  const [y, m] = from.slice(0, 7).split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Keyword impressions this month against last month, biggest first. */
export function keywordMoves(cur: KeywordRow[], prev: KeywordRow[], limit = 25): { keyword: string; now: number | null; before: number | null; isNew: boolean }[] {
  const p = new Map(prev.map((r) => [r.keyword, r.impressions]));
  return cur
    .map((r) => ({ keyword: r.keyword, now: r.impressions, before: p.has(r.keyword) ? (p.get(r.keyword) ?? null) : null, isNew: !p.has(r.keyword) }))
    .sort((a, b) => (b.now ?? 0) - (a.now ?? 0) || a.keyword.localeCompare(b.keyword))
    .slice(0, limit);
}

/** "locations/123" from GBP_LOCATION, also accepting "accounts/1/locations/123" or the bare id. */
export function locationName(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = /locations\/([^/\s]+)/.exec(s);
  if (m) return `locations/${m[1]}`;
  return /^\d+$/.test(s) ? `locations/${s}` : null;
}
