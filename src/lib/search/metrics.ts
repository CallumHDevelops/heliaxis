import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CHANNELS, ORGANIC_CHANNELS, type Channel } from './channel';
import { BANDS, bandCounts, delta, visibilityScore, weightedPosition, winnersAndLosers, type Band, type Delta } from './maths';
import { addDays, ukClock, weekOf } from './schedule';
import { getSetting } from './server';
import { tierOf } from './settings';

/**
 * The Overview and report numbers for a period (spec §10.2, §10.6). Weeks run Monday to Sunday, UK time. Search Console
 * measures are daily sums; rank counts come from the period's last SERP run, compared with the run before it.
 */

type Db = ReturnType<typeof createAdminClient>;

export type Filters = { device?: 'mobile' | 'desktop'; tier?: number; town?: string; service?: string; intent?: string };

export type Period = { start: string; end: string; compareStart: string; compareEnd: string; label: string };

export type PeriodKey = 'this_week' | 'last_week' | 'last_4_weeks' | 'this_month' | 'last_month' | 'quarter';

export function periodFor(key: PeriodKey = 'this_week', today = ukClock().date, compare: 'previous' | 'year' = 'previous'): Period {
  const wk = weekOf(today);
  let start = wk.start;
  let end = wk.end;
  let label = 'This week';
  const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
  const monthEnd = (d: string) => addDays(`${addMonths(monthStart(d), 1)}`, -1);
  if (key === 'last_week') {
    start = addDays(wk.start, -7);
    end = addDays(wk.start, -1);
    label = 'Last week';
  } else if (key === 'last_4_weeks') {
    start = addDays(wk.start, -21);
    label = 'Last 4 weeks';
  } else if (key === 'this_month') {
    start = monthStart(today);
    end = monthEnd(today);
    label = 'This month';
  } else if (key === 'last_month') {
    start = addMonths(monthStart(today), -1);
    end = addDays(monthStart(today), -1);
    label = 'Last month';
  } else if (key === 'quarter') {
    const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
    start = `${today.slice(0, 4)}-${String(q).padStart(2, '0')}-01`;
    end = addDays(addMonths(start, 3), -1);
    label = 'This quarter';
  }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  if (compare === 'year') return { start, end, compareStart: addMonths(start, -12), compareEnd: addMonths(end, -12), label };
  return { start, end, compareStart: addDays(start, -days), compareEnd: addDays(start, -1), label };
}

function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d, 12));
  return dt.toISOString().slice(0, 10);
}

/** UK midnight at the start of a date, as an ISO instant (for timestamptz filters). */
function ukStart(date: string): string {
  const noon = new Date(`${date}T12:00:00Z`);
  const ukNoon = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(noon));
  const offset = ukNoon - 12; // 0 in winter, 1 in summer
  return new Date(Date.parse(`${date}T00:00:00Z`) - offset * 3_600_000).toISOString();
}

type KwRow = { id: number; phrase: string; town: string | null; service: string | null; intent: string; priority: number; volume: number | null };
type ResRow = { keyword_id: number; date: string; our_pos: number | null; our_pack_pos: number | null; aio_present: boolean; aio_cited: boolean; error: string | null };

export type Tile = { key: string; label: string; source: string; delta: Delta; lowerIsBetter?: boolean; spark: (number | null)[]; note?: string; unit?: string };

export type Overview = {
  period: Period;
  filters: Filters;
  tiles: Tile[];
  weeks: string[];
  clicksSeries: { week: string; clicks: number; impressions: number }[];
  bandSeries: { week: string; counts: Record<Band, number> }[];
  winners: ReturnType<typeof winnersAndLosers>['winners'];
  losers: ReturnType<typeof winnersAndLosers>['losers'];
  leads: { channel: Channel | 'untracked'; now: number; before: number }[];
  freshness: { gscTo: string | null; serpRun: string | null };
  rankRunDates: { now: string | null; before: string | null };
};

/** Enquiries before channel tracking began: Meta lead forms are still paid Meta by their source. */
export const channelOf = (r: { channel: string | null; source: string | null }): Channel | 'untracked' =>
  (r.channel as Channel | null) ?? (/^meta/i.test(r.source ?? '') ? 'paid_meta' : 'untracked');

export async function overview(opts: { period?: Period; filters?: Filters } = {}, db: Db = createAdminClient()): Promise<Overview> {
  const period = opts.period ?? periodFor('this_week');
  const f = opts.filters ?? {};
  const device = f.device ?? 'mobile';
  const weeks: string[] = [];
  const firstWeek = addDays(weekOf(period.end).start, -25 * 7);
  for (let w = firstWeek; w <= period.end; w = addDays(w, 7)) weeks.push(w);

  const [areas, kwRes, gscRes, resRes, enqRes, lastRun] = await Promise.all([
    getSetting('areas', db),
    db.from('seo_keyword').select('id, phrase, town, service, intent, priority, volume').eq('active', true),
    db.from('gsc_daily').select('date, clicks, impressions, position').gte('date', weeks[0]).lte('date', addDays(weeks[weeks.length - 1], 6)).limit(200000),
    db.from('seo_serp_result').select('keyword_id, date, our_pos, our_pack_pos, aio_present, aio_cited, error').eq('device', device).gte('date', addDays(weeks[0], -7)).lte('date', period.end).limit(50000),
    db.from('enquiries').select('created_at, channel, source').gte('created_at', ukStart(addDays(weeks[0], -7))).lte('created_at', ukStart(addDays(period.end, 1))).limit(20000),
    db.from('seo_serp_run').select('run_date, finished_at').eq('status', 'done').neq('kind', 'live').order('finished_at', { ascending: false }).limit(1),
  ]);

  const kws = ((kwRes.data ?? []) as KwRow[]).filter(
    (k) => (!f.town || k.town === f.town) && (!f.service || k.service === f.service) && (!f.intent || k.intent === f.intent) && (!f.tier || tierOf(k.town, areas.list) === f.tier),
  );
  const kwIds = new Set(kws.map((k) => k.id));
  const kwById = new Map(kws.map((k) => [k.id, k]));

  // ── Search Console, by week and for the two periods
  const gsc = (gscRes.data ?? []) as { date: string; clicks: number; impressions: number; position: number | null }[];
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const gscSum = (a: string, b: string) => {
    const rows = gsc.filter((r) => inRange(r.date, a, b));
    return rows.length
      ? { clicks: rows.reduce((s, r) => s + r.clicks, 0), impressions: rows.reduce((s, r) => s + r.impressions, 0), position: weightedPosition(rows) }
      : { clicks: null, impressions: null, position: null };
  };
  const gNow = gscSum(period.start, period.end);
  const gBefore = gscSum(period.compareStart, period.compareEnd);
  const clicksSeries = weeks.map((w) => {
    const s = gscSum(w, addDays(w, 6));
    return { week: w, clicks: s.clicks ?? 0, impressions: s.impressions ?? 0 };
  });

  // ── Rankings: the last run in each week
  const results = ((resRes.data ?? []) as ResRow[]).filter((r) => kwIds.has(r.keyword_id) && !r.error);
  const runDates = [...new Set(results.map((r) => r.date))].sort();
  const lastRunIn = (a: string, b: string) => [...runDates].reverse().find((d) => d >= a && d <= b) ?? null;
  const at = (date: string | null) => (date ? results.filter((r) => r.date === date) : []);
  const nowDate = lastRunIn(period.start, period.end) ?? lastRunIn('0000-01-01', period.end);
  const beforeDate = nowDate ? ([...runDates].reverse().find((d) => d < nowDate && d <= period.compareEnd) ?? [...runDates].reverse().find((d) => d < nowDate) ?? null) : null;
  const rankStats = (date: string | null) => {
    const rows = at(date);
    if (!rows.length) return null;
    return {
      top3: rows.filter((r) => r.our_pos !== null && r.our_pos <= 3).length,
      top10: rows.filter((r) => r.our_pos !== null && r.our_pos <= 10).length,
      visibility: visibilityScore(rows.map((r) => ({ pos: r.our_pos, volume: kwById.get(r.keyword_id)?.volume ?? null }))),
      bands: bandCounts(rows.map((r) => r.our_pos)),
    };
  };
  const rNow = rankStats(nowDate);
  const rBefore = rankStats(beforeDate);
  const bandSeries = weeks.map((w) => {
    const d = lastRunIn(w, addDays(w, 6));
    return { week: w, counts: d ? bandCounts(at(d).map((r) => r.our_pos)) : (Object.fromEntries(BANDS.map((b) => [b, 0])) as Record<Band, number>) };
  });
  const prevPos = new Map(at(beforeDate).map((r) => [r.keyword_id, r.our_pos]));
  const moves = at(nowDate)
    .filter((r) => prevPos.has(r.keyword_id))
    .map((r) => {
      const k = kwById.get(r.keyword_id)!;
      return { keywordId: r.keyword_id, label: k.phrase, before: prevPos.get(r.keyword_id) ?? null, now: r.our_pos, volume: k.volume };
    });
  const wl = winnersAndLosers(moves);

  // ── Enquiries by channel
  const enq = (enqRes.data ?? []) as { created_at: string; channel: string | null; source: string | null }[];
  const enqIn = (a: string, b: string) => {
    const from = Date.parse(ukStart(a));
    const to = Date.parse(ukStart(addDays(b, 1)));
    return enq.filter((e) => {
      const t = Date.parse(e.created_at);
      return t >= from && t < to;
    });
  };
  const organic = (a: string, b: string) => enqIn(a, b).filter((e) => (ORGANIC_CHANNELS as string[]).includes(channelOf(e))).length;
  const leads = [...CHANNELS, 'untracked' as const]
    .map((ch) => ({ channel: ch, now: enqIn(period.start, period.end).filter((e) => channelOf(e) === ch).length, before: enqIn(period.compareStart, period.compareEnd).filter((e) => channelOf(e) === ch).length }))
    .filter((r) => r.now || r.before);

  // ── Sparklines: the last 12 weeks
  const last12 = weeks.slice(-12);
  const sparkGsc = (k: 'clicks' | 'impressions' | 'position') => last12.map((w) => gscSum(w, addDays(w, 6))[k]);
  const sparkRank = (k: 'top3' | 'visibility') => last12.map((w) => rankStats(lastRunIn(w, addDays(w, 6)))?.[k] ?? null);
  const sparkOrganic = last12.map((w) => organic(w, addDays(w, 6)));

  const gscTo = gsc.length ? gsc.reduce((m, r) => (r.date > m ? r.date : m), '') : null;
  const tiles: Tile[] = [
    { key: 'organic_enquiries', label: 'Organic enquiries', source: 'Enquiries: Google, Bing, Business Profile and AI assistants', delta: delta(organic(period.start, period.end), organic(period.compareStart, period.compareEnd)), spark: sparkOrganic },
    { key: 'clicks', label: 'Organic clicks', source: 'Search Console', delta: delta(gNow.clicks, gBefore.clicks), spark: sparkGsc('clicks'), note: gscTo ? undefined : 'Search Console is not connected yet' },
    { key: 'impressions', label: 'Impressions', source: 'Search Console', delta: delta(gNow.impressions, gBefore.impressions), spark: sparkGsc('impressions'), note: gscTo ? undefined : 'Search Console is not connected yet' },
    { key: 'avg_position', label: 'Average position', source: 'Search Console, weighted by impressions', delta: delta(gNow.position, gBefore.position, true), lowerIsBetter: true, spark: sparkGsc('position'), note: gscTo ? undefined : 'Search Console is not connected yet' },
    { key: 'top3', label: 'In the top 3', source: `Tracked searches, ${device}`, delta: delta(rNow?.top3 ?? null, rBefore?.top3 ?? null), spark: sparkRank('top3'), note: rNow ? `${rNow.top10} in the top 10` : 'No rankings run yet' },
    { key: 'visibility', label: 'Visibility', source: 'Share of the clicks available across tracked searches, 0 to 100', delta: delta(rNow?.visibility ?? null, rBefore?.visibility ?? null), spark: sparkRank('visibility') },
    { key: 'gbp_actions', label: 'Business Profile actions', source: 'Business Profile: calls, website clicks, directions', delta: delta(null, null), spark: [], note: 'Business Profile is not connected yet' },
    { key: 'ai_mentions', label: 'AI mention share', source: 'Sampled AI answers naming Heliaxis (monthly)', delta: delta(null, null), spark: [], note: 'AI answer sampling arrives in phase 4', unit: '%' },
  ];

  return {
    period,
    filters: f,
    tiles,
    weeks,
    clicksSeries,
    bandSeries,
    winners: wl.winners,
    losers: wl.losers,
    leads,
    freshness: { gscTo, serpRun: (lastRun.data?.[0]?.run_date as string | undefined) ?? null },
    rankRunDates: { now: nowDate, before: beforeDate },
  };
}
