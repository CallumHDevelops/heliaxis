import { describe, expect, it } from 'vitest';
import { pointsForRank, visibilityShares } from '@/lib/social/competitors/visibility';

describe('search visibility', () => {
  it('scores 10 for first, 1 for tenth, nothing outside the top ten', () => {
    expect([1, 2, 10, 11, null].map(pointsForRank)).toEqual([10, 9, 1, 0, 0]);
  });
  it('shares the points between businesses and counts the searches checked', () => {
    const r = visibilityShares([
      { keyword_id: 1, competitor_id: 'us', organic_rank: 1, local_pack_rank: null },
      { keyword_id: 1, competitor_id: 'them', organic_rank: 2, local_pack_rank: 1 },
      { keyword_id: 2, competitor_id: 'us', organic_rank: 3, local_pack_rank: 2 },
    ]);
    expect(r.searches).toBe(2);
    expect(r.total).toBe(10 + (9 + 10) + (8 + 9));
    expect(r.shares.us).toBeCloseTo(((10 + 17) / 46) * 100, 0);
  });
  it('shows no shares when nothing was checked', () => {
    expect(visibilityShares([]).shares).toEqual({});
  });
});
