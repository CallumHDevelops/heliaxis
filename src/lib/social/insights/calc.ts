/** Pure maths for the Insights screens. No I/O. */

export type Point = { date: string; value: number };

/** The first and last value in a series, and how much it moved. Null when there is no history to compare. */
export function change(series: Point[]): { start: number; end: number; delta: number; pct: number | null } | null {
  const s = [...series].sort((a, b) => a.date.localeCompare(b.date));
  if (s.length < 2) return null;
  const start = s[0].value;
  const end = s[s.length - 1].value;
  return { start, end, delta: end - start, pct: start > 0 ? ((end - start) / start) * 100 : null };
}

/** Day-by-day change of a running total such as followers, so a dip shows as a negative bar. */
export function dailyNet(series: Point[]): Point[] {
  const s = [...series].sort((a, b) => a.date.localeCompare(b.date));
  return s.slice(1).map((p, i) => ({ date: p.date, value: p.value - s[i].value }));
}

export type PostStat = { id: string; likes: number; comments: number; shares: number | null; reach: number | null };

/** Engagement per post. A rate only when reach is known: it is never worked out from a guess. */
export function engagement(p: PostStat): { total: number; rate: number | null } {
  const total = p.likes + p.comments + (p.shares ?? 0);
  return { total, rate: p.reach && p.reach > 0 ? (total / p.reach) * 100 : null };
}

export function topPosts<T extends PostStat>(posts: T[], n = 5): (T & { total: number; rate: number | null })[] {
  return posts
    .map((p) => ({ ...p, ...engagement(p) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sharePct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** "2h 10m" for a number of minutes. */
export function durationText(mins: number | null): string {
  if (mins == null) return 'n/a';
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
