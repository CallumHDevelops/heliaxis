import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDays, ukClock } from '../schedule';
import { GBP_METRICS, lastFullMonths, locationName, parseDailyMetrics, parseKeywords, type KeywordRow } from './gbp-parse';

/**
 * Our Google Business Profile performance (spec §4.2, §5 M5): calls, website clicks, direction requests and impressions
 * by day, and the search keywords people used to find the profile by month, from the Business Profile Performance API.
 * It signs in with OAuth as the profile's owner: GBP_CLIENT_ID, GBP_CLIENT_SECRET and GBP_REFRESH_TOKEN (scope
 * business.manage), and GBP_LOCATION ("locations/…"). Until all four are set, the import does nothing.
 */

type Db = ReturnType<typeof createAdminClient>;
const API = 'https://businessprofileperformance.googleapis.com/v1';

const env = (k: string) => String(process.env[k] ?? '').trim();
export const gbpLocation = () => locationName(env('GBP_LOCATION'));
export const gbpConfigured = () => !!(env('GBP_CLIENT_ID') && env('GBP_CLIENT_SECRET') && env('GBP_REFRESH_TOKEN') && gbpLocation());
/** Which of the four settings are missing (names only, never values). */
export const gbpMissing = () => ['GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN', 'GBP_LOCATION'].filter((k) => (k === 'GBP_LOCATION' ? !gbpLocation() : !env(k)));

let cached: { token: string; expires: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env('GBP_CLIENT_ID'), client_secret: env('GBP_CLIENT_SECRET'), refresh_token: env('GBP_REFRESH_TOKEN') }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Business Profile sign-in: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function get(path: string, params: URLSearchParams): Promise<unknown> {
  const r = await fetch(`${API}/${path}?${params}`, { headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(60_000), cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!r.ok) throw new Error(`Business Profile: ${j.error?.message || r.status}`);
  return j;
}

const ymd = (prefix: string, date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return [
    [`${prefix}.year`, String(y)],
    [`${prefix}.month`, String(m)],
    [`${prefix}.day`, String(d)],
  ];
};

async function fetchDaily(from: string, to: string) {
  const loc = gbpLocation()!;
  const p = new URLSearchParams([...GBP_METRICS.map((m) => ['dailyMetrics', m]), ...ymd('dailyRange.startDate', from), ...ymd('dailyRange.endDate', to)]);
  return parseDailyMetrics(await get(`${loc}:fetchMultiDailyMetricsTimeSeries`, p));
}

async function fetchKeywords(month: string): Promise<KeywordRow[]> {
  const loc = gbpLocation()!;
  const [y, m] = month.split('-').map(Number);
  const rows: KeywordRow[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 20; page++) {
    const p = new URLSearchParams({
      'monthlyRange.startMonth.year': String(y),
      'monthlyRange.startMonth.month': String(m),
      'monthlyRange.endMonth.year': String(y),
      'monthlyRange.endMonth.month': String(m),
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    const { rows: got, next } = parseKeywords(await get(`${loc}/searchkeywords/impressions/monthly`, p));
    rows.push(...got);
    if (!next) break;
    pageToken = next;
  }
  return rows;
}

/**
 * Daily 05:30: re-pull the last 7 days (Google's figures settle over a few days), or 18 months on the first run. From the
 * 3rd of the month, last month's keywords (the first run fills the last 6 months).
 */
export async function importBusinessProfile(db: Db = createAdminClient(), now = new Date()): Promise<{ connected: boolean; days: number; keywordMonths: string[]; missing?: string[] }> {
  if (!gbpConfigured()) return { connected: false, days: 0, keywordMonths: [], missing: gbpMissing() };
  const c = ukClock(now);
  const { count } = await db.from('gbp_daily').select('date', { count: 'exact', head: true });
  const to = addDays(c.date, -1);
  const from = addDays(c.date, count ? -7 : -540);
  const rows = await fetchDaily(from, to);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('gbp_daily').upsert(rows.slice(i, i + 500), { onConflict: 'date,metric' });
    if (error) throw new Error(error.message);
  }

  const keywordMonths: string[] = [];
  if (c.dom >= 3) {
    const { data: have } = await db.from('gbp_keyword_monthly').select('month').gte('month', `${lastFullMonths(c.date, 6)[5]}-01`).limit(5000);
    const got = new Set((have ?? []).map((h) => String(h.month).slice(0, 7)));
    // Last month if it isn't in; the earlier five only on the first run.
    const want = got.size ? lastFullMonths(c.date, 1) : lastFullMonths(c.date, 6);
    for (const month of want.filter((m) => !got.has(m))) {
      const kws = await fetchKeywords(month);
      if (kws.length) {
        const { error } = await db.from('gbp_keyword_monthly').upsert(kws.map((k) => ({ month: `${month}-01`, keyword: k.keyword, impressions: k.impressions })), { onConflict: 'month,keyword' });
        if (error) throw new Error(error.message);
      }
      keywordMonths.push(month);
    }
  }
  return { connected: true, days: new Set(rows.map((r) => r.date)).size, keywordMonths };
}
