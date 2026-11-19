import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CHANNEL_LABEL } from './channel';
import { unknownNumbers } from './maths';
import { overview, periodFor, type Overview } from './metrics';
import { addDays, ukClock } from './schedule';

/**
 * Reports (spec §10.3). The weekly report is built provisional on Monday 07:00 and final on Wednesday 07:00, once Search
 * Console has Sunday's data; a final report is frozen, so last week's numbers never shift. The words are written from the
 * snapshot, and a check rejects any text whose numbers are not in it.
 */

type Db = ReturnType<typeof createAdminClient>;

export type ReportNumbers = Pick<Overview, 'tiles' | 'winners' | 'losers' | 'leads' | 'freshness' | 'rankRunDates'> & { fourWeek: Record<string, number | null> };
export type ReportText = { headline: string[]; actions: string[] };

const fmt = (n: number | null | undefined, unit = '') => (n === null || n === undefined ? 'no data' : `${Math.round(n * 10) / 10}${unit}`);

/** Three plain sentences from the numbers alone (no model, so nothing can be invented). */
export function headline(o: Pick<Overview, 'tiles' | 'winners' | 'losers' | 'leads'>): string[] {
  const t = Object.fromEntries(o.tiles.map((x) => [x.key, x]));
  const out: string[] = [];
  const org = t.organic_enquiries?.delta;
  out.push(
    org && org.now !== null
      ? `Organic enquiries: ${fmt(org.now)} this week against ${fmt(org.before)} the week before.`
      : 'No organic enquiries were recorded this week.',
  );
  const top = t.top3?.delta;
  out.push(top && top.now !== null ? `${fmt(top.now)} tracked searches are in Google’s top 3 (${fmt(top.before)} last run), and visibility is ${fmt(t.visibility?.delta.now)} out of 100.` : 'There is no rankings run for this week yet.');
  const clicks = t.clicks?.delta;
  out.push(
    clicks && clicks.now !== null
      ? `Search Console shows ${fmt(clicks.now)} clicks from ${fmt(t.impressions?.delta.now)} impressions, at an average position of ${fmt(t.avg_position?.delta.now)}.`
      : o.winners.length
        ? `The biggest rise was “${o.winners[0].label}”, up ${o.winners[0].moved} places.`
        : 'Search Console is not connected yet, so clicks and impressions are not shown.',
  );
  return out;
}

export async function buildWeeklyReport(opts: { status: 'provisional' | 'final'; today?: string }, db: Db = createAdminClient()) {
  const today = opts.today ?? ukClock().date;
  // On Monday and Wednesday, the report is for the week that has just ended.
  const period = periodFor('last_week', today);
  const { data: existing } = await db.from('seo_report').select('id, status').eq('kind', 'weekly').eq('period_start', period.start).eq('period_end', period.end).maybeSingle();
  if (existing?.status === 'final') return existing.id as number; // frozen

  const o = await overview({ period }, db);
  const fourWeek: Record<string, number | null> = {};
  for (const tile of o.tiles) {
    const vals = tile.spark.slice(-4).filter((v): v is number => v !== null);
    fourWeek[tile.key] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }
  const numbers: ReportNumbers = { tiles: o.tiles, winners: o.winners, losers: o.losers, leads: o.leads, freshness: o.freshness, rankRunDates: o.rankRunDates, fourWeek };
  const text: ReportText = { headline: headline(o), actions: [] };

  // Every number in the words must be in the snapshot.
  const allowed: number[] = [];
  for (const t of o.tiles) allowed.push(...[t.delta.now, t.delta.before, t.delta.abs, t.delta.pct].filter((v): v is number => v !== null));
  for (const w of [...o.winners, ...o.losers]) allowed.push(w.moved, Math.abs(w.moved), ...(w.now !== null ? [w.now] : []), ...(w.before !== null ? [w.before] : []));
  for (const l of o.leads) allowed.push(l.now, l.before);
  allowed.push(3, 100); // "top 3", "out of 100"
  const bad = unknownNumbers(text.headline.join(' '), allowed);
  if (bad.length) throw new Error(`Report text has numbers not in the snapshot: ${bad.join(', ')}`);

  const row = { kind: 'weekly', name: `Week of ${period.start}`, period_start: period.start, period_end: period.end, compare_start: period.compareStart, compare_end: period.compareEnd, status: opts.status, numbers, text };
  const { data, error } = await db.from('seo_report').upsert(row, { onConflict: 'kind,period_start,period_end' }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export const channelName = (c: string) => (c === 'untracked' ? 'Before tracking began' : (CHANNEL_LABEL as Record<string, string>)[c] ?? c);
export const reportWeekLabel = (start: string) => `${new Date(`${start}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${new Date(`${addDays(start, 6)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
