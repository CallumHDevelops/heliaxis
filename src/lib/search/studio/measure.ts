/**
 * Measuring a published page (spec §5 M4.6) at 0, 14, 28, 56 and 90 days. Pure: the job in measure-job.ts reads the rows.
 */

export const MEASURE_DAYS = [14, 28, 56, 90] as const;

const dayMs = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysIso(date: string, n: number) {
  return isoDay(new Date(new Date(`${date.slice(0, 10)}T12:00:00Z`).getTime() + n * dayMs));
}

/** Days whose measure is due (the day has passed) and not yet recorded. */
export function dueDays(publishedAt: string, done: number[], today: string): number[] {
  const pub = publishedAt.slice(0, 10);
  return MEASURE_DAYS.filter((d) => !done.includes(d) && addDaysIso(pub, d) <= today);
}

export type Measure = { day: number; best_pos: number | null; impressions: number | null; clicks: number | null; enquiries: number | null };

/** Best (lowest) organic position across the page's searches in the 7 days up to `end`. */
export function bestPosition(rows: { date: string; our_pos: number | null }[], end: string, windowDays = 7): number | null {
  const start = addDaysIso(end, -windowDays);
  let best: number | null = null;
  for (const r of rows) if (r.date > start && r.date <= end && r.our_pos != null && (best == null || r.our_pos < best)) best = r.our_pos;
  return best;
}

/** Search Console clicks and impressions for the page between two dates (inclusive). */
export function gscTotals(rows: { date: string; page: string; clicks: number; impressions: number }[], path: string, from: string, to: string) {
  let clicks = 0;
  let impressions = 0;
  for (const r of rows) {
    if (r.date < from || r.date > to || !pageMatches(r.page, path)) continue;
    clicks += r.clicks;
    impressions += r.impressions;
  }
  return { clicks, impressions };
}

export function pageMatches(url: string, path: string): boolean {
  let p = String(url || '');
  try {
    if (/^https?:/i.test(p)) p = new URL(p).pathname;
  } catch {
    /* keep as is */
  }
  const norm = (s: string) => (s.toLowerCase().replace(/\/+$/, '') || '/');
  return norm(p) === norm(path);
}

/**
 * A page has moved when its best position improved by 3 or more places, or it entered the top 100. Without any ranking
 * data, Search Console impressions growing counts as movement. Otherwise it goes back to the planner as Improve.
 */
export function hasMoved(base: Measure | undefined, now: Measure): boolean {
  const b = base?.best_pos ?? null;
  const a = now.best_pos;
  if (a != null && b == null) return true;
  if (a != null && b != null) return b - a >= 3;
  const bi = base?.impressions ?? 0;
  return (now.impressions ?? 0) > Math.max(10, bi * 1.5);
}
