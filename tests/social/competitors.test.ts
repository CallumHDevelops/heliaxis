import { describe, expect, it } from 'vitest';
import { ageDays, growth, latestCell, shareOf, sortBy, type SnapshotRow } from '@/lib/social/competitors/league';
import { SEED_GEO_PROMPTS, seedKeywords, SEED_SUGGESTED, SEED_TRACKED } from '@/lib/social/competitors/seed';

const rows: SnapshotRow[] = [
  { competitor_id: 'a', date: '2026-09-01', metric: 'ig_followers', value: 1000, method: 'manual', source: 'screenshot' },
  { competitor_id: 'a', date: '2026-10-01', metric: 'ig_followers', value: 1100, method: 'manual', source: 'screenshot' },
  { competitor_id: 'a', date: '2026-10-20', metric: 'google_rating', value: null, method: 'manual', source: 'x', unavailable_reason: 'Hidden by Google' },
];

describe('seed lists', () => {
  it('has the 40 search terms, each once', () => {
    const k = seedKeywords();
    expect(k).toHaveLength(40);
    expect(new Set(k.map((x) => x.keyword)).size).toBe(40);
  });
  it('has six tracked competitors, thirteen suggestions and ten questions', () => {
    expect(SEED_TRACKED).toHaveLength(6);
    expect(SEED_SUGGESTED).toHaveLength(13);
    expect(SEED_GEO_PROMPTS).toHaveLength(10);
  });
});

describe('league figures', () => {
  it('shows the newest value with its date and method', () => {
    expect(latestCell(rows, 'a', 'ig_followers')).toMatchObject({ value: 1100, date: '2026-10-01', method: 'manual', reason: null });
  });
  it('says why a value is missing instead of showing zero', () => {
    expect(latestCell(rows, 'a', 'google_rating')).toMatchObject({ value: null, reason: 'Hidden by Google' });
    expect(latestCell(rows, 'a', 'fb_followers')).toMatchObject({ value: null, reason: 'Not recorded yet' });
  });
  it('works out 30-day growth only when there is an older figure', () => {
    expect(growth(rows, 'a', 'ig_followers', 30)).toEqual({ delta: 100, pct: 10 });
    expect(growth(rows, 'a', 'ig_followers', 90)).toBeNull();
  });
  it('sorts with unknowns last', () => {
    const cell = (value: number | null) => ({ value, date: null, method: null, source: null, reason: null });
    const t = [{ id: 1, cells: { m: cell(null) } }, { id: 2, cells: { m: cell(5) } }, { id: 3, cells: { m: cell(9) } }];
    expect(sortBy(t, 'm').map((x) => x.id)).toEqual([3, 2, 1]);
  });
  it('share of voice leaves unknowns out and reports coverage', () => {
    const r = shareOf([{ id: 'a', value: 30 }, { id: 'b', value: 10 }, { id: 'c', value: null }]);
    expect(r.shares).toEqual({ a: 75, b: 25 });
    expect(r.covered).toBe(2);
    expect(r.total).toBe(3);
  });
  it('age in days', () => {
    expect(ageDays('2026-10-01', Date.parse('2026-10-11'))).toBe(10);
    expect(ageDays(null)).toBeNull();
  });
});
