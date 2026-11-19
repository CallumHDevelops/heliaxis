import { describe, expect, it } from 'vitest';
import { BASE, centreOf, coordinate, distanceKm, gridEstimate, gridKeywords, gridPlan, gridPoints, gridReach, isOurListing, parseMapsItems, rankBand, scanSummary, WAITING } from '@/lib/search/local/grid';
import { addressWords, compareNap, napMismatch, normaliseName, normalisePhone, postcodeOf, sameAddress } from '@/lib/search/local/nap';
import { categoryGaps, median, profileRows, reviewPaceTarget, type BusinessRow, type SnapshotRow } from '@/lib/search/local/profile';
import { keywordMoves, lastFullMonths, locationName, monthTotals, parseDailyMetrics, parseKeywords } from '@/lib/search/local/gbp-parse';
import { DEFAULT_AREAS } from '@/lib/search/settings';

describe('map-pack reach (spec §9)', () => {
  const byName = (n: string) => DEFAULT_AREAS.find((a) => a.name === n)!;

  it('gives the areas near Newport a grid', () => {
    for (const n of ['Newport', 'Cardiff', 'Chepstow and Caldicot', 'Usk, Monmouth, Abergavenny', 'Penarth and the Vale', 'Bridgend and Porthcawl']) {
      expect(gridReach(byName(n)).grid, n).toBe(true);
    }
  });

  it('labels West Wales, Bristol and Wiltshire "organic only"', () => {
    for (const n of ['Carmarthen and the Tywi valley', 'Bristol north-west', 'Chippenham and Corsham']) {
      const r = gridReach(byName(n));
      expect(r.grid, n).toBe(false);
      if (!r.grid) expect(r.label).toBe('organic only');
    }
  });

  it('puts anything over 50 km out of reach whatever its region', () => {
    const r = gridReach(byName('Swansea, Mumbles and Gower'));
    expect(r.grid).toBe(false);
    if (!r.grid) {
      expect(r.label).toBe('organic only');
      expect(r.km).toBeGreaterThan(50);
    }
  });

  it('skips tiers 2 and 3 and areas with no centre on file', () => {
    expect(gridReach(byName('Caerphilly'))).toMatchObject({ grid: false, label: 'not tier 1' });
    expect(gridReach({ name: 'Nowhere', region: 'South East Wales', tier: 1, towns: ['Nowhere'] })).toMatchObject({ grid: false, label: 'no centre' });
  });

  it('uses the grid centre, and accepts "lat,lng"', () => {
    const r = gridReach(byName('Cardiff'));
    expect(r.grid && r.centreName).toBe('Lisvane');
    expect(centreOf('51.6, -2.95')).toEqual({ lat: 51.6, lng: -2.95 });
    // The two Newports stay apart.
    expect(centreOf('Newport (Pembs)')!.lng).toBeLessThan(-4.5);
    expect(Math.round(distanceKm(centreOf('Newport')!, centreOf('Newport (Pembs)')!))).toBeGreaterThan(100);
    expect(centreOf('Newport (Gwent)')).toBeNull();
    expect(centreOf('999,0')).toBeNull();
  });

  it('measures distance in km', () => {
    expect(Math.round(distanceKm(BASE, centreOf('Cardiff')!))).toBeGreaterThan(15);
    expect(Math.round(distanceKm(BASE, centreOf('Cardiff')!))).toBeLessThan(25);
  });
});

describe('grid points', () => {
  it('makes 25 points, 10 km across, centred', () => {
    const c = { lat: 51.5842, lng: -2.9977 };
    const pts = gridPoints(c);
    expect(pts).toHaveLength(25);
    expect(pts[12]).toEqual({ lat: 51.5842, lng: -2.9977 });
    expect(Math.round(distanceKm(pts[10], pts[14]) * 10) / 10).toBeCloseTo(10, 0);
    expect(Math.round(distanceKm(pts[2], pts[22]) * 10) / 10).toBeCloseTo(10, 0);
    expect(pts[0].lat).toBeGreaterThan(pts[24].lat); // north first
    expect(pts[0].lng).toBeLessThan(pts[4].lng); // west to east
    expect(new Set(pts.map((p) => `${p.lat},${p.lng}`)).size).toBe(25);
  });

  it('formats location_coordinate with a zoom', () => {
    expect(coordinate({ lat: 51.5, lng: -3.1 })).toBe('51.5,-3.1,13z');
  });
});

describe('which searches go on a grid', () => {
  const kws = [
    { id: 1, phrase: 'solar panels cardiff', town: 'Cardiff', intent: 'local_commercial', priority: 2, volume: 500 },
    { id: 2, phrase: 'battery storage cardiff', town: 'Cardiff', intent: 'local_commercial', priority: 1, volume: 50 },
    { id: 3, phrase: 'is solar worth it cardiff', town: 'Cardiff', intent: 'informational', priority: 1, volume: 900 },
    { id: 4, phrase: 'solar panels newport', town: 'Newport', intent: 'local_commercial', priority: 1, volume: 300 },
    { id: 5, phrase: 'old', town: 'Cardiff', intent: 'local_commercial', priority: 1, volume: 1, active: false },
  ];
  it('takes the area’s own searches, local commercial and priority 1 first', () => {
    const area = DEFAULT_AREAS.find((a) => a.name === 'Cardiff')!;
    expect(gridKeywords(area, kws).map((k) => k.id)).toEqual([2, 1, 3]);
    expect(gridKeywords(area, kws, 2).map((k) => k.id)).toEqual([2, 1]);
  });
  it('plans only Tier 1 and estimates 25 tasks a grid', () => {
    const plan = gridPlan(DEFAULT_AREAS, kws);
    expect(plan).toHaveLength(DEFAULT_AREAS.filter((a) => a.tier === 1).length);
    expect(plan.find((p) => p.area === 'Bristol north-west')!.keywords).toEqual([]);
    const est = gridEstimate(plan);
    expect(est.scans).toBe(4);
    expect(est.tasks).toBe(100);
    expect(est.usd).toBeCloseTo(0.06, 4);
  });
});

describe('a Maps result', () => {
  const items = [
    { type: 'maps_paid_item', rank_group: 1, title: 'Advert Solar', domain: 'advert.co.uk' },
    { type: 'maps_search', rank_group: 1, title: 'Sunny Ltd', domain: 'sunny.co.uk', rating: { value: 4.9, votes_count: 120 } },
    { type: 'maps_search', rank_group: 2, title: 'Bright Energy', url: 'https://www.bright.co.uk/contact' },
    { type: 'maps_search', rank_group: 3, title: 'Volt Wales', domain: null },
    { type: 'maps_search', rank_group: 4, title: 'Heliaxis Limited', domain: null },
  ];
  it('finds us by name and keeps the top three (not adverts)', () => {
    const r = parseMapsItems(items);
    expect(r.ourRank).toBe(4);
    expect(r.top3.map((t) => t.title)).toEqual(['Sunny Ltd', 'Bright Energy', 'Volt Wales']);
    expect(r.top3[0]).toMatchObject({ rating: 4.9, votes: 120, domain: 'sunny.co.uk' });
    expect(r.top3[1].domain).toBe('bright.co.uk');
  });
  it('finds us by domain, and says null when we are not listed', () => {
    expect(isOurListing({ domain: 'www.heliaxis.co.uk', title: 'Solar installer' })).toBe(true);
    expect(isOurListing({ title: 'Helix Solar' })).toBe(false);
    expect(parseMapsItems(items.slice(0, 3)).ourRank).toBeNull();
    expect(parseMapsItems([]).top3).toEqual([]);
    expect(parseMapsItems(null as unknown as unknown[]).ourRank).toBeNull();
  });
});

describe('scan summary', () => {
  it('averages where we are listed and shares the top 3 over checked points', () => {
    const pts = [
      { our_rank: 1, task_id: 'a' },
      { our_rank: 3, task_id: 'b' },
      { our_rank: 8, task_id: 'c' },
      { our_rank: null, task_id: 'd' },
      { our_rank: null, task_id: null }, // never accepted: left out
    ];
    expect(scanSummary(pts)).toEqual({ checked: 4, found: 3, waiting: 0, avgRank: 4, top3Share: 0.5 });
  });
  it('counts waiting points and returns nulls with nothing checked', () => {
    expect(scanSummary([{ our_rank: WAITING, task_id: 'x' }])).toEqual({ checked: 0, found: 0, waiting: 1, avgRank: null, top3Share: null });
  });
  it('bands ranks', () => {
    expect([1, 3, 4, 10, 11, 20, 21, null].map(rankBand)).toEqual(['top3', 'top3', 'top10', 'top10', 'top20', 'top20', 'out', 'out']);
  });
});

describe('name, address and phone', () => {
  it('normalises UK phone numbers', () => {
    for (const p of ['01633 965205', '+44 1633 965205', '+44 (0)1633 965205', '0044 1633 965 205', '(01633) 965-205', '441633965205']) expect(normalisePhone(p), p).toBe('01633965205');
    expect(normalisePhone('')).toBe('');
    expect(normalisePhone('01633 965206')).not.toBe('01633965205');
  });
  it('normalises business names', () => {
    expect(normaliseName('HELIAXIS LTD.')).toBe('heliaxis');
    expect(normaliseName('Heliaxis Limited')).toBe('heliaxis');
    expect(normaliseName('Sun & Sky Ltd')).toBe('sun and sky');
  });
  it('compares addresses', () => {
    expect(postcodeOf('Unit 3, Example Rd, Newport np20 1ab')).toBe('NP201AB');
    expect(addressWords('Unit 3, Example Rd, Newport, NP20 1AB, United Kingdom')).toEqual(['3', 'example', 'road', 'newport']);
    expect(sameAddress('Unit 3 Example Road, Newport NP20 1AB', '3 Example Rd., Newport, Gwent, NP201AB, UK')).toBe(true);
    expect(sameAddress('3 Example Road, Newport NP20 1AB', '3 Example Road, Newport NP19 4XY')).toBe(false);
    expect(sameAddress('3 Example Road, Newport', '12 Example Road, Newport')).toBe(false);
    expect(sameAddress('NP20 1AB', '3 Example Road, Newport NP20 1AB')).toBe(true);
    expect(sameAddress('3 Example Road, Newport', '9 Other Street, Cardiff')).toBe(false);
  });
  it('flags what does not match the facts', () => {
    const facts = { name: 'Heliaxis', address: '3 Example Road, Newport NP20 1AB', phone: '01633 965205' };
    const ok = compareNap(facts, { name_shown: 'Heliaxis Ltd', address_shown: '3 Example Rd, Newport, NP20 1AB', phone_shown: '+44 1633 965205' });
    expect(ok.map((c) => c.state)).toEqual(['match', 'match', 'match']);
    expect(napMismatch(ok)).toBe(false);
    const bad = compareNap(facts, { name_shown: 'Heliaxis Solar', phone_shown: '07700 900123' });
    expect(bad.map((c) => c.state)).toEqual(['mismatch', 'not_shown', 'mismatch']);
    expect(napMismatch(bad)).toBe(true);
    expect(compareNap({ ...facts, address: '' }, { address_shown: 'Somewhere' })[1].state).toBe('no_fact');
  });
});

describe('profile against rivals and the review pace', () => {
  const biz: BusinessRow[] = [
    { id: 1, name: 'Heliaxis', domain: 'heliaxis.co.uk', primary_category: 'Solar energy installer', categories: ['Solar energy installer'], is_ours: true },
    { id: 2, name: 'Sunny Ltd', domain: 'sunny.co.uk', primary_category: 'Solar energy installer', categories: ['Solar energy installer', 'Electrician'], is_ours: false },
    { id: 3, name: 'Bright Energy', domain: null, primary_category: 'Solar energy installer', categories: ['Electrician', 'Renewable energy company'], is_ours: false },
    { id: 4, name: 'Far Away Solar', domain: null, primary_category: 'Solar energy company', categories: [], is_ours: false },
  ];
  const snaps: SnapshotRow[] = [
    { business_id: 1, date: '2026-11-16', rating: 5, reviews: 20, reviews_90d: 3, photos: 10, responded_pct: 100 },
    { business_id: 1, date: '2026-11-09', rating: 5, reviews: 19, reviews_90d: 2, photos: 10, responded_pct: 100 },
    { business_id: 2, date: '2026-11-16', rating: 4.8, reviews: 300, reviews_90d: 30, photos: 80, responded_pct: 50 },
    { business_id: 3, date: '2026-11-16', rating: 4.6, reviews: 90, reviews_90d: 10, photos: 20, responded_pct: null },
    { business_id: 4, date: '2026-11-16', rating: 4.1, reviews: 9, reviews_90d: 1, photos: 2, responded_pct: null },
  ];

  it('takes each business’s latest snapshot and marks the map pack', () => {
    const rows = profileRows(biz, snaps, ['SUNNY LTD', 'Bright Energy Limited']);
    expect(rows[0].is_ours).toBe(true);
    expect(rows[0].snap?.date).toBe('2026-11-16');
    expect(rows.filter((r) => r.inPack).map((r) => r.id)).toEqual([2, 3]);
  });

  it('sets the target from the median map-pack rival', () => {
    const t = reviewPaceTarget(profileRows(biz, snaps, ['Sunny Ltd', 'Bright Energy']))!;
    expect(t).toMatchObject({ basis: 'map_pack', rivals: 2, medianPace: 20, ourPace: 3, need: 20, ahead: false });
    expect(t.perWeek).toBeCloseTo(1.6, 1);
    expect(t.perMonth).toBeCloseTo(6.7, 1);
  });

  it('falls back to every rival without a pack match, and handles nothing on file', () => {
    const t = reviewPaceTarget(profileRows(biz, snaps))!;
    expect(t).toMatchObject({ basis: 'all_rivals', rivals: 3, medianPace: 10 });
    expect(reviewPaceTarget(profileRows(biz, []))).toBeNull();
    expect(reviewPaceTarget([])).toBeNull();
  });

  it('says when we are already ahead', () => {
    const t = reviewPaceTarget(profileRows(biz, snaps.map((s) => (s.business_id === 1 ? { ...s, reviews_90d: 40 } : s)), ['Sunny Ltd', 'Bright Energy']))!;
    expect(t.ahead).toBe(true);
  });

  it('lists categories most pack rivals have and we lack', () => {
    expect(categoryGaps(profileRows(biz, snaps, ['Sunny Ltd', 'Bright Energy']))).toEqual([
      { category: 'Electrician', rivals: 2 },
      { category: 'Renewable energy company', rivals: 1 },
    ]);
  });

  it('medians', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('Business Profile Performance API', () => {
  it('parses daily metrics, missing values as 0', () => {
    const rows = parseDailyMetrics({
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            { dailyMetric: 'CALL_CLICKS', timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: '3' }, { date: { year: 2026, month: 10, day: 2 } }] } },
            { dailyMetric: 'WEBSITE_CLICKS', timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 1 }, value: '7' }] } },
          ],
        },
      ],
    });
    expect(rows).toEqual([
      { date: '2026-10-01', metric: 'CALL_CLICKS', value: 3 },
      { date: '2026-10-02', metric: 'CALL_CLICKS', value: 0 },
      { date: '2026-10-01', metric: 'WEBSITE_CLICKS', value: 7 },
    ]);
    expect(parseDailyMetrics({})).toEqual([]);
    expect(parseDailyMetrics(null)).toEqual([]);
  });

  it('parses keywords, hidden counts as null', () => {
    const r = parseKeywords({ searchKeywordsCounts: [{ searchKeyword: 'Solar Panels Newport', insightsValue: { value: '120' } }, { searchKeyword: 'heliaxis', insightsValue: { threshold: '15' } }, { searchKeyword: 'solar panels newport', insightsValue: { value: '4' } }], nextPageToken: 'n2' });
    expect(r.next).toBe('n2');
    expect(r.rows).toEqual([
      { keyword: 'solar panels newport', impressions: 120 },
      { keyword: 'heliaxis', impressions: null },
    ]);
  });

  it('adds up months and compares keywords', () => {
    const m = monthTotals([
      { date: '2026-10-01', metric: 'CALL_CLICKS', value: 2 },
      { date: '2026-10-02', metric: 'CALL_CLICKS', value: 1 },
      { date: '2026-10-02', metric: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', value: 40 },
      { date: '2026-10-02', metric: 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', value: 10 },
      { date: '2026-09-30', metric: 'BUSINESS_DIRECTION_REQUESTS', value: 5 },
      { date: '2026-09-30', metric: 'WEBSITE_CLICKS', value: 6 },
    ]);
    expect(m).toEqual([
      { month: '2026-10', calls: 3, website: 0, directions: 0, impressions: 50, days: 2 },
      { month: '2026-09', calls: 0, website: 6, directions: 5, impressions: 0, days: 1 },
    ]);
    const k = keywordMoves([{ keyword: 'a', impressions: 50 }, { keyword: 'b', impressions: null }], [{ keyword: 'a', impressions: 20 }]);
    expect(k).toEqual([
      { keyword: 'a', now: 50, before: 20, isNew: false },
      { keyword: 'b', now: null, before: null, isNew: true },
    ]);
  });

  it('works out months and the location name', () => {
    expect(lastFullMonths('2026-11-19', 3)).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(lastFullMonths('2026-01-03', 1)).toEqual(['2025-12']);
    expect(locationName('locations/123')).toBe('locations/123');
    expect(locationName('accounts/9/locations/456')).toBe('locations/456');
    expect(locationName('789')).toBe('locations/789');
    expect(locationName('')).toBeNull();
    expect(locationName('nonsense')).toBeNull();
  });
});
