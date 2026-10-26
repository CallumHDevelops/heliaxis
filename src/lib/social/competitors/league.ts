/**
 * League table maths. Pure. A value is always shown with the day it was recorded, or "Unavailable"; it is never
 * estimated and never shown as zero when it is simply not known (docs/social-monitoring/09 §1).
 */

export const METRICS = [
  { key: 'ig_followers', platform: 'instagram', label: 'Instagram followers', unit: '' },
  { key: 'fb_followers', platform: 'facebook', label: 'Facebook followers', unit: '' },
  { key: 'google_rating', platform: 'google', label: 'Google rating', unit: '' },
  { key: 'google_reviews', platform: 'google', label: 'Google reviews', unit: '' },
  { key: 'tp_rating', platform: 'trustpilot', label: 'Trustpilot rating', unit: '' },
  { key: 'tp_reviews', platform: 'trustpilot', label: 'Trustpilot reviews', unit: '' },
  { key: 'tp_reply_rate', platform: 'trustpilot', label: 'Review reply rate', unit: '%' },
  { key: 'posts_per_week', platform: 'instagram', label: 'Posts per week', unit: '' },
] as const;
export type MetricKey = (typeof METRICS)[number]['key'];

export type SnapshotRow = { competitor_id: string; date: string; metric: string; value: number | null; method: string; source: string; unavailable_reason?: string | null };

export type Cell = { value: number | null; date: string | null; method: string | null; source: string | null; reason: string | null };

/** The newest recorded value of one metric for one business. */
export function latestCell(rows: SnapshotRow[], competitorId: string, metric: string): Cell {
  const mine = rows.filter((r) => r.competitor_id === competitorId && r.metric === metric).sort((a, b) => b.date.localeCompare(a.date));
  const r = mine[0];
  if (!r) return { value: null, date: null, method: null, source: null, reason: 'Not recorded yet' };
  return { value: r.value, date: r.date, method: r.method, source: r.source, reason: r.value == null ? (r.unavailable_reason ?? 'Unavailable') : null };
}

/** Change between the newest value and the newest one at least `days` older. Null when there is no older value. */
export function growth(rows: SnapshotRow[], competitorId: string, metric: string, days = 30): { delta: number; pct: number | null } | null {
  const mine = rows.filter((r) => r.competitor_id === competitorId && r.metric === metric && r.value != null).sort((a, b) => b.date.localeCompare(a.date));
  if (mine.length < 2) return null;
  const newest = mine[0];
  const cutoff = new Date(Date.parse(newest.date) - days * 86_400_000).toISOString().slice(0, 10);
  const older = mine.find((r) => r.date <= cutoff);
  if (!older || older.value == null || newest.value == null) return null;
  return { delta: newest.value - older.value, pct: older.value > 0 ? ((newest.value - older.value) / older.value) * 100 : null };
}

/** How old a figure is, in days, so a stale one can be flagged. */
export const ageDays = (date: string | null, now = Date.now()) => (date ? Math.floor((now - Date.parse(date)) / 86_400_000) : null);

/** Sort businesses by a metric, highest first, with unknowns last. */
export function sortBy<T extends { cells: Record<string, Cell> }>(rows: T[], metric: string): T[] {
  return [...rows].sort((a, b) => {
    const av = a.cells[metric]?.value;
    const bv = b.cells[metric]?.value;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}

/** Share of a total, as a percentage, for share-of-voice style bars. Unknown values are left out of the total, and the coverage is returned. */
export function shareOf(values: { id: string; value: number | null }[]): { shares: Record<string, number>; covered: number; total: number } {
  const known = values.filter((v) => v.value != null && v.value > 0) as { id: string; value: number }[];
  const sum = known.reduce((s, v) => s + v.value, 0);
  const shares: Record<string, number> = {};
  for (const v of known) shares[v.id] = sum > 0 ? Math.round((v.value / sum) * 1000) / 10 : 0;
  return { shares, covered: known.length, total: values.length };
}
