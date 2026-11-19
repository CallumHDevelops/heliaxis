import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clickShare, history, isInstaller, isOurs, movers, ourPlace, packLeague, parseSerp, summarise, visibility, type SerpResult, type SerpSnapshot } from '@/lib/seo/rankings';

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
    expect(movers(a, b).map((m) => [m.keywordId, m.change])).toEqual([[2, 86], [1, 5]]);
    expect(history([b, a], 1)).toEqual([{ id: '2026-11-09', pos: 8 }, { id: '2026-11-16', pos: 3 }]);
  });
});

describe('google links', () => {
  it('keeps a Google redirect it cannot place as unresolved, so the positions under it stay true', () => {
    const p = parseSerp([
      { type: 'organic', rank_group: 1, domain: 'google.com', url: 'https://google.com/goto?url=x', title: 'X' },
      { type: 'organic', rank_group: 2, domain: 'www.real.co.uk', url: 'https://real.co.uk', title: 'Real' },
    ]);
    expect(p.organic.map((x) => [x.pos, x.domain, x.resolvedBy])).toEqual([[1, '', 'unresolved'], [2, 'real.co.uk', 'url']]);
    // An unresolved row is nobody's: it never shows as a competitor.
    expect(visibility({ id: 'x', at: 'x', costUsd: 0, results: [{ ...res(1, 'Cardiff', []), organic: p.organic }] }, false).map((x) => x.domain)).toEqual(['real.co.uk']);
  });
});

describe('phase 0 gate: the stored sample (every link wrapped) returns real domains', () => {
  const sample = JSON.parse(readFileSync(join(__dirname, 'fixtures/seo-serp-sample-v1.json'), 'utf8')) as { items: unknown[] };
  it('resolves every organic row', () => {
    const p = parseSerp(sample.items);
    expect(p.organic).toHaveLength(7);
    const resolved = p.organic.filter((x) => x.domain && x.domain !== 'google.com');
    expect(resolved.length / p.organic.length).toBeGreaterThanOrEqual(0.95);
    expect(p.organic.map((x) => x.domain)).toEqual(['solarlocator.co.uk', 'yell.com', 'yell.com', 'solarwinds.cardiff.gov.uk', 'solarplanet.uk', 'yell.com', 'facebook.com']);
    expect(p.organic.every((x) => x.resolvedBy === 'breadcrumb')).toBe(true);
    expect(p.organic[0].rankAbsolute).toBe(6);
    expect(p.localPack.map((x) => x.title)).toEqual(['Green Energy Solar', 'The Solar House', 'Cymru Solar']);
    expect(p.features).toEqual(['find_results_on', 'local_pack', 'people_also_ask']);
  });
});

describe('after resolve_goto_urls: real urls, depth 100, AI Overview', () => {
  it('reads resolved urls even when the domain still says google.com', () => {
    const p = parseSerp([{ type: 'organic', rank_group: 1, domain: 'google.com', url: 'https://www.greenenergysolar.co.uk/cardiff', title: 'G' }]);
    expect(p.organic[0]).toMatchObject({ domain: 'greenenergysolar.co.uk', resolvedBy: 'url' });
  });

  it('falls back to the site name when there is no breadcrumb', () => {
    const p = parseSerp([{ type: 'organic', rank_group: 3, domain: 'google.com', url: 'https://google.com/goto?url=Z', website_name: 'solarplanet.uk', title: 'S' }]);
    expect(p.organic[0]).toMatchObject({ domain: 'solarplanet.uk', url: 'https://solarplanet.uk/', resolvedBy: 'website_name' });
    // A plain business name is not an address.
    expect(parseSerp([{ type: 'organic', rank_group: 1, domain: 'google.com', url: 'https://google.com/goto?url=Z', website_name: 'Yell' }]).organic[0].resolvedBy).toBe('unresolved');
  });

  it('records our position wherever it falls in 1 to 100, and a second page of ours', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ type: 'organic', rank_group: i + 1, rank_absolute: i + 3, domain: `site${i}.co.uk`, url: `https://site${i}.co.uk/` }));
    items[70] = { type: 'organic', rank_group: 71, rank_absolute: 73, domain: 'heliaxis.co.uk', url: 'https://heliaxis.co.uk/solar-panels-cardiff' };
    items[88] = { type: 'organic', rank_group: 89, rank_absolute: 91, domain: 'heliaxis.co.uk', url: 'https://heliaxis.co.uk/blog/x' };
    const p = parseSerp(items);
    expect(p.organic).toHaveLength(100);
    expect(ourPlace(p.organic, p.localPack)).toEqual({ pos: 71, url: 'https://heliaxis.co.uk/solar-panels-cardiff', pack: null, abs: 73, also: ['https://heliaxis.co.uk/blog/x'] });
    expect(clickShare(71)).toBeGreaterThan(0);
    expect(clickShare(101)).toBe(0);
  });

  it('notes an AI Overview and whether it cites us', () => {
    const p = parseSerp([
      { type: 'ai_overview', rank_group: 1, items: [{ type: 'ai_overview_element', references: [{ domain: 'heliaxis.co.uk', url: 'https://heliaxis.co.uk/battery-storage', source: 'Heliaxis' }] }] },
      { type: 'organic', rank_group: 1, domain: 'a.co.uk', url: 'https://a.co.uk/' },
    ]);
    expect(p.aio).toMatchObject({ present: true, cited: true });
    expect(p.features).toEqual(['ai_overview']);
    expect(parseSerp([]).aio).toEqual({ present: false, cited: false, references: [] });
  });
});

describe('real addresses behind Google links (shapes from a real DataForSEO answer, Nov 2026)', () => {
  const g = (rank: number, breadcrumb: string, website_name: string) => ({ type: 'organic', rank_group: rank, domain: 'google.com', url: 'https://google.com/goto?url=CAES', breadcrumb, website_name, title: website_name });
  it('reads the site from the breadcrumb and rebuilds the page where it can', () => {
    const p = parseSerp([
      { type: 'local_pack', rank_group: 1, domain: 'google.com', title: 'Green Energy Solar' },
      g(1, 'https://www.solarlocator.co.uk › service-types › cardiff', 'solarlocator.co.uk'),
      g(2, 'https://www.yell.com › ... › Solar Energy near CARDIFF', 'Yell'),
      g(3, 'https://solarwinds.cardiff.gov.uk', 'Cardiff Council'),
      g(4, 'https://solarplanet.uk › how-much-do-solar-panels-cost-...', 'solarplanet.uk'),
      g(5, 'https://heliaxis.co.uk › solar-panels', 'Heliaxis'),
    ]);
    expect(p.organic.map((x) => [x.domain, x.url])).toEqual([
      ['solarlocator.co.uk', 'https://solarlocator.co.uk/service-types/cardiff'],
      ['yell.com', 'https://yell.com/'],
      ['solarwinds.cardiff.gov.uk', 'https://solarwinds.cardiff.gov.uk/'],
      ['solarplanet.uk', 'https://solarplanet.uk/'],
      ['heliaxis.co.uk', 'https://heliaxis.co.uk/solar-panels'],
    ]);
    expect(p.localPack).toEqual([{ pos: 1, title: 'Green Energy Solar', domain: '' }]);
    expect(ourPlace(p.organic, p.localPack)).toEqual({ pos: 5, url: 'https://heliaxis.co.uk/solar-panels', pack: null });
    expect(isInstaller('yell.com')).toBe(false);
  });
});

describe('map pack league', () => {
  it('counts businesses by name across searches', () => {
    const r = (id: number, town: string, names: string[]): SerpResult => ({ keywordId: id, keyword: 'k', town, location: town, organic: [], localPack: names.map((title, i) => ({ pos: i + 1, title, domain: '' })), ours: { pos: null, url: null, pack: null } });
    const l = packLeague({ id: 'x', at: 'x', costUsd: 0, results: [r(1, 'Cardiff', ['A', 'B']), r(2, 'Bath', ['B', 'C'])] });
    expect(l[0]).toEqual({ name: 'B', appearances: 2, first: 1, towns: ['Bath', 'Cardiff'] });
  });
});
