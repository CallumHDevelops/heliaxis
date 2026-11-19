import { clickShare } from '@/lib/seo/rankings';

/**
 * The numbers behind the Overview and the reports (spec §10.6). Pure, so they can be tested.
 */

export type Band = '1-3' | '4-10' | '11-20' | '21-50' | '51-100' | 'not found';
export const BANDS: Band[] = ['1-3', '4-10', '11-20', '21-50', '51-100', 'not found'];

export function band(pos: number | null | undefined): Band {
  if (!pos || pos < 1 || pos > 100) return 'not found';
  if (pos <= 3) return '1-3';
  if (pos <= 10) return '4-10';
  if (pos <= 20) return '11-20';
  if (pos <= 50) return '21-50';
  return '51-100';
}

export function bandCounts(positions: (number | null)[]): Record<Band, number> {
  const out = Object.fromEntries(BANDS.map((b) => [b, 0])) as Record<Band, number>;
  for (const p of positions) out[band(p)]++;
  return out;
}

/**
 * Visibility = Σ(volume × click share at our position) ÷ Σ(volume × click share at position 1) × 100. A search with no
 * known volume counts as volume 10, so new searches still count a little.
 */
export function visibilityScore(rows: { pos: number | null; volume: number | null }[]): number {
  let got = 0;
  let max = 0;
  for (const r of rows) {
    const v = r.volume && r.volume > 0 ? r.volume : 10;
    got += v * clickShare(r.pos);
    max += v * clickShare(1);
  }
  return max ? Math.round((got / max) * 1000) / 10 : 0;
}

/** Average position weighted by impressions (Search Console's own way). */
export function weightedPosition(rows: { impressions: number; position: number | null }[]): number | null {
  let w = 0;
  let s = 0;
  for (const r of rows) {
    if (r.position === null || !r.impressions) continue;
    w += r.impressions;
    s += r.impressions * r.position;
  }
  return w ? Math.round((s / w) * 10) / 10 : null;
}

export type Delta = { now: number | null; before: number | null; abs: number | null; pct: number | null; good: boolean | null; small: boolean };

/**
 * This period against the last: the absolute and percentage change, and whether it is good (lower is better for
 * position). Under 10 last time, the percentage is hidden and the change is labelled "small numbers".
 */
export function delta(now: number | null, before: number | null, lowerIsBetter = false): Delta {
  if (now === null || before === null) return { now, before, abs: null, pct: null, good: null, small: false };
  const abs = Math.round((now - before) * 10) / 10;
  const small = Math.abs(before) < 10;
  const pct = small || before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
  const good = abs === 0 ? null : lowerIsBetter ? abs < 0 : abs > 0;
  return { now, before, abs, pct, good, small };
}

export type MoveRow = { keywordId: number; label: string; before: number | null; now: number | null; volume: number | null };

/** The biggest rises and falls, ranked by places moved × search volume (out of the top 100 counts as 101). */
export function winnersAndLosers(rows: MoveRow[], n = 5): { winners: (MoveRow & { moved: number })[]; losers: (MoveRow & { moved: number })[] } {
  const scored = rows
    .map((r) => ({ ...r, moved: (r.before ?? 101) - (r.now ?? 101) }))
    .filter((r) => r.moved !== 0)
    .map((r) => ({ ...r, weight: Math.abs(r.moved) * (r.volume && r.volume > 0 ? r.volume : 10) }));
  const winners = scored.filter((r) => r.moved > 0).sort((a, b) => b.weight - a.weight).slice(0, n);
  const losers = scored.filter((r) => r.moved < 0).sort((a, b) => b.weight - a.weight).slice(0, n);
  const strip = (r: (typeof scored)[number]) => ({ keywordId: r.keywordId, label: r.label, before: r.before, now: r.now, volume: r.volume, moved: r.moved });
  return { winners: winners.map(strip), losers: losers.map(strip) };
}

/** Every number in a piece of report text must be in the snapshot (spec §10.3). Returns the ones that aren't. */
export function unknownNumbers(text: string, allowed: (number | string)[]): string[] {
  const ok = new Set<string>();
  for (const a of allowed) {
    const n = typeof a === 'number' ? a : Number(String(a).replace(/[,%$£]/g, ''));
    if (!Number.isFinite(n)) continue;
    ok.add(String(n));
    ok.add(String(Math.abs(n)));
    ok.add(String(Math.round(n)));
    ok.add(String(Math.abs(Math.round(n))));
    ok.add(n.toFixed(1));
    ok.add(Math.abs(n).toFixed(1));
  }
  const found = text.match(/\d[\d,]*(\.\d+)?/g) ?? [];
  return found.map((f) => f.replace(/,/g, '')).filter((f) => !ok.has(f) && !ok.has(String(Number(f))));
}
