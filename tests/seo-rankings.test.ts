import { describe, expect, it } from 'vitest';
import { history, isInstaller, isOurs, movers, ourPlace, parseSerp, summarise, visibility, type SerpResult, type SerpSnapshot } from '@/lib/seo/rankings';

const res = (keywordId: number, town: string, organic: [number, string][], oursPos: number | null = null, pack: number | null = null): SerpResult => ({
  keywordId,
  keyword: `solar panels ${town}`,
  town,
  location: town,
  organic: organic.map(([pos, domain]) => ({ pos, domain, url: `https://${domain}/${town.toLowerCase()}`, title: domain })),
  localPack: [],
  ours: { pos: oursPos, url: oursPos ? 'https://heliaxis.co.uk/' : null, pack },
});
const snap = (id: string, results: SerpResult[]): SerpSnapshot => ({ id, at: `${id}T05:00:00Z`, costUsd: 0.1, results });

describe('rankings', () => {
  it('knows our domain and the non-installers', () => {
    expect(isOurs('www.heliaxis.co.uk')).toBe(true);
    expect(isOurs('notheliaxis.co.uk')).toBe(false);
    expect(isInstaller('checkatrade.com')).toBe(false);
    expect(isInstaller('www.greenenergysolar.co.uk')).toBe(true);
  });

  it('parses DataForSEO items, keeping organic and map pack', () => {
    const p = parseSerp([
      { type: 'organic', rank_group: 2, domain: 'www.b.co.uk', url: 'https://b.co.uk', title: 'B' },
      { type: 'local_pack', rank_group: 1, domain: 'heliaxis.co.uk', title: 'Heliaxis Ltd' },
      { type: 'organic', rank_group: 1, domain: 'a.co.uk', url: 'https://a.co.uk', title: 'A' },
      { type: 'people_also_ask', rank_group: 1 },
    ]);
    expect(p.organic.map((x) => x.domain)).toEqual(['a.co.uk', 'b.co.uk']);
    expect(ourPlace(p.organic, p.localPack)).toEqual({ pos: null, url: null, pack: 1 });
  });

  it('builds a visibility league of installers, one result per site per search', () => {
    const s = snap('2026-11-16', [
      res(1, 'Cardiff', [[1, 'a.co.uk'], [2, 'checkatrade.com'], [3, 'a.co.uk'], [5, 'heliaxis.co.uk']], 5),
      res(2, 'Bristol', [[1, 'b.co.uk'], [4, 'a.co.uk']]),
    ]);
    const l = visibility(s);
    expect(l.map((x) => x.domain)).toEqual(['a.co.uk', 'b.co.uk', 'heliaxis.co.uk']);
    expect(l[0].searches).toBe(2);
    expect(l[0].towns).toEqual(['Bristol', 'Cardiff']);
    expect(visibility(s, false).some((x) => x.domain === 'checkatrade.com')).toBe(true);
    const sum = summarise(s)!;
    expect(sum.top10).toBe(1);
    expect(sum.avgPos).toBe(5);
    expect(sum.visibility).toBeGreaterThan(0);
  });

  it('finds our movers and history', () => {
    const a = snap('2026-11-09', [res(1, 'Cardiff', [], 8), res(2, 'Bristol', [], null)]);
    const b = snap('2026-11-16', [res(1, 'Cardiff', [], 3), res(2, 'Bristol', [], 15)]);
    expect(movers(a, b).map((m) => [m.keywordId, m.change])).toEqual([[2, 6], [1, 5]]);
    expect(history([b, a], 1)).toEqual([{ id: '2026-11-09', pos: 8 }, { id: '2026-11-16', pos: 3 }]);
  });
});
