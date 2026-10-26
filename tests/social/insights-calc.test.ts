import { describe, expect, it } from 'vitest';
import { change, dailyNet, durationText, engagement, median, sharePct, topPosts } from '@/lib/social/insights/calc';
import { CATALOGUE } from '@/lib/social/insights/catalogue';

const series = [
  { date: '2026-10-03', value: 130 },
  { date: '2026-10-01', value: 100 },
  { date: '2026-10-02', value: 110 },
];

describe('followers over time', () => {
  it('works out the change from first to last day, whatever order they arrive in', () => {
    expect(change(series)).toEqual({ start: 100, end: 130, delta: 30, pct: 30 });
  });
  it('has no change to show with one day of history', () => {
    expect(change([{ date: '2026-10-01', value: 5 }])).toBeNull();
  });
  it('shows a drop as a negative day', () => {
    expect(dailyNet([{ date: 'a', value: 10 }, { date: 'b', value: 8 }, { date: 'c', value: 9 }]).map((p) => p.value)).toEqual([-2, 1]);
  });
  it('gives no percentage from a start of zero', () => {
    expect(change([{ date: 'a', value: 0 }, { date: 'b', value: 4 }])?.pct).toBeNull();
  });
});

describe('engagement', () => {
  it('has no rate when reach is unknown', () => {
    expect(engagement({ id: 'p', likes: 10, comments: 2, shares: null, reach: null })).toEqual({ total: 12, rate: null });
  });
  it('works out the rate from reach when known', () => {
    expect(engagement({ id: 'p', likes: 10, comments: 5, shares: 5, reach: 1000 }).rate).toBeCloseTo(2, 5);
  });
  it('ranks the best posts first', () => {
    const top = topPosts([
      { id: 'a', likes: 1, comments: 0, shares: null, reach: null },
      { id: 'b', likes: 9, comments: 3, shares: null, reach: null },
      { id: 'c', likes: 5, comments: 1, shares: null, reach: null },
    ], 2);
    expect(top.map((p) => p.id)).toEqual(['b', 'c']);
  });
});

describe('small helpers', () => {
  it('median of odd and even lists', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('share as a percentage', () => {
    expect(sharePct(1, 3)).toBe(33.3);
    expect(sharePct(1, 0)).toBeNull();
  });
  it('durations read as people say them', () => {
    expect(durationText(0.4)).toBe('under a minute');
    expect(durationText(45)).toBe('45 min');
    expect(durationText(130)).toBe('2h 10m');
    expect(durationText(null)).toBe('n/a');
  });
});

describe('metric catalogue', () => {
  it('never lists an unavailable metric with an API name, and always says why', () => {
    for (const c of CATALOGUE.filter((x) => !x.available)) {
      expect(c.apiName).toBeNull();
      expect(c.reason).toBeTruthy();
    }
  });
});
