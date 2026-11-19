/**
 * M5 profile against rivals and the review-pace target (spec §5 M5; strategy §6). Pure. The target is what it takes to
 * match the median map-pack rival's reviews over the next 90 days, met by asking every customer (Ask A, no reward).
 */

import { normaliseName } from './nap';

export type BusinessRow = {
  id: number;
  name: string;
  domain: string | null;
  primary_category: string | null;
  categories: string[] | null;
  is_ours: boolean;
};
export type SnapshotRow = { business_id: number; date: string; rating: number | null; reviews: number | null; reviews_90d: number | null; photos: number | null; responded_pct: number | null };

export type ProfileRow = BusinessRow & { snap: SnapshotRow | null; inPack: boolean };

/** Each business with its latest snapshot, and whether it shows in the map pack of a tracked search. */
export function profileRows(businesses: BusinessRow[], snaps: SnapshotRow[], packNames: string[] = []): ProfileRow[] {
  const latest = new Map<number, SnapshotRow>();
  for (const s of snaps) {
    const cur = latest.get(s.business_id);
    if (!cur || s.date > cur.date) latest.set(s.business_id, s);
  }
  const pack = new Set(packNames.map(normaliseName).filter(Boolean));
  return businesses
    .map((b) => ({ ...b, snap: latest.get(b.id) ?? null, inPack: pack.has(normaliseName(b.name)) }))
    .sort((a, b) => Number(b.is_ours) - Number(a.is_ours) || Number(b.inPack) - Number(a.inPack) || (b.snap?.reviews ?? -1) - (a.snap?.reviews ?? -1));
}

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export type PaceTarget = {
  /** Rivals the median was taken from, and whether they are map-pack rivals or (with no pack match) every rival. */
  basis: 'map_pack' | 'all_rivals';
  rivals: number;
  medianPace: number;
  ourPace: number | null;
  /** New reviews we need in the next 90 days to match the median pace; 0 when we already do. */
  need: number;
  perWeek: number;
  perMonth: number;
  ahead: boolean;
};

/**
 * What it takes to match the median map-pack rival in 90 days: their median reviews_90d, against ours. Rivals with no
 * snapshot are left out; with no map-pack rival on file, every rival is used and the basis says so.
 */
export function reviewPaceTarget(rows: ProfileRow[]): PaceTarget | null {
  const ours = rows.find((r) => r.is_ours) ?? null;
  const rivals = rows.filter((r) => !r.is_ours && typeof r.snap?.reviews_90d === 'number');
  const pack = rivals.filter((r) => r.inPack);
  const pool = pack.length ? pack : rivals;
  const med = median(pool.map((r) => r.snap!.reviews_90d!));
  if (med === null) return null;
  const ourPace = typeof ours?.snap?.reviews_90d === 'number' ? ours.snap.reviews_90d : null;
  const need = Math.max(0, Math.ceil(med));
  return {
    basis: pack.length ? 'map_pack' : 'all_rivals',
    rivals: pool.length,
    medianPace: med,
    ourPace,
    need,
    perWeek: Math.round((need / (90 / 7)) * 10) / 10,
    perMonth: Math.round((need / 3) * 10) / 10,
    ahead: ourPace !== null && ourPace >= med,
  };
}

/** Categories at least half the map-pack rivals (or all rivals) list that our profile doesn't. */
export function categoryGaps(rows: ProfileRow[]): { category: string; rivals: number }[] {
  const ours = rows.find((r) => r.is_ours);
  const rivalsAll = rows.filter((r) => !r.is_ours);
  const pool = rivalsAll.some((r) => r.inPack) ? rivalsAll.filter((r) => r.inPack) : rivalsAll;
  if (!pool.length) return [];
  const have = new Set([ours?.primary_category, ...(ours?.categories ?? [])].filter(Boolean).map((c) => String(c).toLowerCase()));
  const count = new Map<string, { label: string; n: number }>();
  for (const r of pool) {
    for (const c of new Set([r.primary_category, ...(r.categories ?? [])].filter(Boolean).map(String))) {
      const k = c.toLowerCase();
      const e = count.get(k) ?? { label: c, n: 0 };
      e.n++;
      count.set(k, e);
    }
  }
  return [...count.entries()]
    .filter(([k, e]) => !have.has(k) && e.n >= Math.ceil(pool.length / 2))
    .map(([, e]) => ({ category: e.label, rivals: e.n }))
    .sort((a, b) => b.rivals - a.rivals || a.category.localeCompare(b.category));
}
