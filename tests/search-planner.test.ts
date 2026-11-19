import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANNER, parsePlanner } from '@/lib/search/planner/config';
import {
  buildCandidates,
  countByDistrict,
  difficultyBand,
  effortOf,
  groupCandidates,
  matchExisting,
  planGroup,
  positionGain,
  proofForTown,
  quadrantOf,
  scoreOf,
  type Candidate,
  type Group,
} from '@/lib/search/planner/plan';
import { parseDifficulty, parseIntent, parseLabsItems, strikingDistance, topRivals } from '@/lib/search/planner/parse';
import { estimateOf, ideaSeedsFor, relatedSeedsFor, researchSteps } from '@/lib/search/planner/steps';
import { detectService, detectTown, intentClass, isRelevantIdea, linkingHint, normaliseUrl, outcode, pageTypeOf, townMatchers } from '@/lib/search/planner/words';

const S = parsePlanner({});
const towns = townMatchers(['Newport', 'Newport (Pembs)', 'Cardiff', 'Swansea', 'Bridgend', 'Merthyr Tydfil']);

const cand = (over: Partial<Candidate> & { key: string }): Candidate => ({
  phrase: over.key,
  keywordId: null,
  sources: ['tracked'],
  volume: 100,
  volumeFrom: 'tracked',
  difficulty: null,
  intent: 'local_commercial',
  pos: null,
  url: null,
  targetPage: null,
  service: 'solar',
  town: null,
  rivals: [],
  top10: [],
  ...over,
});
const urls = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}.co.uk`);

describe('settings', () => {
  it('defaults when empty or broken, merges partial values', () => {
    expect(parsePlanner(undefined)).toEqual({ ...DEFAULT_PLANNER });
    expect(parsePlanner({ overlapUrls: 'x' })).toEqual({ ...DEFAULT_PLANNER });
    const p = parsePlanner({ intentWeights: { informational: 0.5 }, difficultyCuts: [70, 15] });
    expect(p.intentWeights).toEqual({ local_commercial: 3, commercial: 2, informational: 0.5 });
    expect(p.difficultyCuts).toEqual([15, 70]);
  });
});

describe('words', () => {
  it('reads service, town, intent and page type', () => {
    expect(detectService('Solar panels Cardiff')).toBe('solar');
    expect(detectService('home battery installer')).toBe('battery');
    expect(detectService('solar and battery cost')).toBe('solar');
    expect(detectService('air source heat pump grants')).toBe('heat_pump');
    expect(detectService('ev charger installation')).toBe('ev');
    expect(detectTown('solar panels newport pembrokeshire', towns)).toBe('Newport (Pembs)');
    expect(detectTown('solar panels newport', towns)).toBe('Newport');
    expect(detectTown('solar panels merthyr', towns)).toBe('Merthyr Tydfil');
    expect(detectTown('solar panels', towns)).toBeNull();
    expect(intentClass('commercial', 'solar panels cardiff', 'Cardiff')).toBe('local_commercial');
    expect(intentClass('transactional', 'buy solar panels', null)).toBe('commercial');
    expect(intentClass('informational', 'how do solar panels work', null)).toBe('informational');
    expect(intentClass(null, 'how do solar panels work', null)).toBe('informational');
    expect(intentClass(null, 'solar installers near me', null)).toBe('local_commercial');
    expect(pageTypeOf('solar panels cardiff', 'Cardiff', 'local_commercial')).toBe('town');
    expect(pageTypeOf('solar panel cost', null, 'commercial')).toBe('cost_guide');
    expect(pageTypeOf('solar vs heat pump', null, 'commercial')).toBe('comparison');
    expect(pageTypeOf('commercial solar panels', null, 'commercial')).toBe('sector');
    expect(pageTypeOf('solar for farms', null, 'commercial')).toBe('sector');
    expect(pageTypeOf('solar case study cardiff', 'Cardiff', 'commercial')).toBe('case_study');
    expect(pageTypeOf('do solar panels work in winter', null, 'informational')).toBe('article');
    expect(pageTypeOf('solar panels', null, 'commercial')).toBe('pillar');
    expect(pageTypeOf('solar panel installers near me', null, 'local_commercial')).toBe('pillar');
  });

  it('drops ideas outside our area or shopping for kit', () => {
    expect(isRelevantIdea('solar panels cardiff')).toBe(true);
    expect(isRelevantIdea('solar panels london')).toBe(false);
    expect(isRelevantIdea('solar garden lights')).toBe(false);
    expect(isRelevantIdea('solar panel kits for sale')).toBe(false);
    expect(isRelevantIdea('loft insulation')).toBe(false);
  });

  it('normalises URLs and postcodes', () => {
    expect(normaliseUrl('https://www.Example.co.uk/solar/?utm=1#x')).toBe('example.co.uk/solar');
    expect(normaliseUrl('https://example.co.uk/')).toBe('example.co.uk');
    expect(outcode('np20 1ab')).toBe('NP20');
    expect(outcode('CF101AB')).toBe('CF10');
    expect(outcode('SA4')).toBe('SA4');
    expect(outcode('not a postcode')).toBeNull();
    expect(outcode(null)).toBeNull();
  });

  it('gives strategy §4 linking hints', () => {
    expect(linkingHint('article', 'solar', null)).toContain('/solar-panels');
    expect(linkingHint('article', 'solar', null)).toContain('quote page');
    expect(linkingHint('town', 'battery', 'Cardiff')).toContain('nearby town');
  });
});

describe('candidates', () => {
  it('merges sources per phrase, folding plurals, keeping the best position and real volume', () => {
    const c = buildCandidates(
      [
        { keyword: 'solar panel cardiff', source: 'idea', volume: 320, difficulty: 22, intent: 'commercial', pos: null, url: null, rival: null },
        { keyword: 'solar panels cardiff', source: 'gsc', volume: 40, difficulty: null, intent: null, pos: 14.2, url: 'https://heliaxis.co.uk/solar-panels-cardiff', rival: null },
        { keyword: 'solar panels cardiff', source: 'gap', volume: 320, difficulty: null, intent: null, pos: 2, url: 'https://rival.co.uk/', rival: 'rival.co.uk' },
        { keyword: 'heliaxis solar', source: 'gsc', volume: 900, difficulty: null, intent: null, pos: 1, url: null, rival: null },
        { keyword: 'battery storage', source: 'gsc', volume: 55, difficulty: null, intent: null, pos: 22, url: null, rival: null },
      ],
      [{ id: 7, phrase: 'solar panels cardiff', town: 'Cardiff', service: 'solar', intent: 'local_commercial', target_page: null, volume: null, our_pos: 31, our_url: 'https://heliaxis.co.uk/x', top10: ['a.co.uk'] }],
      towns,
    );
    expect(c).toHaveLength(2);
    const sp = c.find((x) => x.keywordId === 7)!;
    expect(sp.sources.sort()).toEqual(['gap', 'gsc', 'idea', 'tracked']);
    expect(sp.volume).toBe(320);
    expect(sp.volumeFrom).toBe('labs');
    expect(sp.pos).toBe(14.2); // Search Console beat the tracked 31; the rival's 2 is not ours
    expect(sp.url).toBe('https://heliaxis.co.uk/solar-panels-cardiff');
    expect(sp.difficulty).toBe(22);
    expect(sp.rivals).toEqual(['rival.co.uk']);
    const b = c.find((x) => x.key === 'battery storage')!;
    expect(b.volume).toBe(55);
    expect(b.volumeFrom).toBe('gsc_impressions');
    expect(b.service).toBe('battery');
  });
});

describe('grouping by SERP overlap', () => {
  it('puts searches sharing 4 or more top-10 URLs on one page, and splits those sharing 3', () => {
    const shared = urls('s', 4);
    const a = cand({ key: 'solar panels cardiff', volume: 500, top10: [...shared, ...urls('a', 6)] });
    const b = cand({ key: 'solar panel installers cardiff', volume: 200, top10: [...shared, ...urls('b', 6)] });
    const c = cand({ key: 'solar companies cardiff', volume: 50, top10: [...shared.slice(0, 3), ...urls('c', 7)] });
    const g = groupCandidates([c, b, a], 4);
    expect(g).toHaveLength(2);
    expect(g[0].primary.key).toBe('solar panels cardiff');
    expect(g[0].members.map((m) => m.key)).toEqual(['solar panels cardiff', 'solar panel installers cardiff']);
    expect(g[0].members[1].shared).toBe(4);
    expect(g[0].by).toBe('serp');
    expect(g[1].primary.key).toBe('solar companies cardiff');
  });

  it('does not chain: a member must overlap the primary, not just another member', () => {
    const a = cand({ key: 'a', volume: 300, top10: [...urls('x', 4), ...urls('a', 6)] });
    const b = cand({ key: 'b', volume: 200, top10: [...urls('x', 4), ...urls('y', 4), 'b1', 'b2'] });
    const c = cand({ key: 'c', volume: 100, top10: [...urls('y', 4), ...urls('c', 6)] });
    const g = groupCandidates([a, b, c], 4);
    expect(g.map((x) => x.members.map((m) => m.key))).toEqual([['a', 'b'], ['c']]);
  });

  it('groups searches with no SERP data by service and town, joining a SERP group with the same words', () => {
    const tracked = cand({ key: 'solar panels cardiff', town: 'Cardiff', volume: 500, top10: urls('t', 10) });
    const idea = cand({ key: 'solar panel fitters cardiff', town: 'Cardiff', volume: 30, sources: ['idea'] });
    const cost1 = cand({ key: 'solar panel cost', intent: 'commercial', volume: 900, sources: ['idea'] });
    const cost2 = cand({ key: 'how much do solar panels cost', intent: 'commercial', volume: 400, sources: ['idea'] });
    const g = groupCandidates([tracked, idea, cost1, cost2], 4);
    expect(g).toHaveLength(2);
    expect(g[0].by).toBe('mixed');
    expect(g[0].members.map((m) => [m.key, m.by])).toEqual([
      ['solar panels cardiff', 'primary'],
      ['solar panel fitters cardiff', 'words'],
    ]);
    expect(g[1].by).toBe('words');
    expect(g[1].primary.key).toBe('solar panel cost');
    expect(g[1].members).toHaveLength(2);
  });
});

describe('proof and mapping', () => {
  const areas = [
    { name: 'Cardiff', towns: ['Cardiff'], installs: 'unknown' as const },
    { name: 'Swansea, Mumbles and Gower', towns: ['Swansea', 'Mumbles'], installs: 'unknown' as const },
    { name: 'Newport', towns: ['Newport'], installs: 'yes' as const },
  ];
  const crm = countByDistrict([
    { postcode: 'CF14 3AB', kind: 'install' },
    { postcode: 'SA4 1XX', kind: 'survey' },
    { postcode: 'junk', kind: 'install' },
  ]);

  it('counts CRM work by postcode district', () => {
    expect(crm).toEqual({ CF14: { installs: 1, surveys: 0 }, SA4: { installs: 0, surveys: 1 } });
    expect(proofForTown('Cardiff', areas, crm).has).toBe(true);
    expect(proofForTown('Newport', areas, {}).has).toBe(true); // Target areas says yes
    const sw = proofForTown('Swansea', areas, crm);
    expect(sw.has).toBe(false);
    expect(sw.surveys).toBe(1);
  });

  const group = (c: Candidate): Group => ({ primary: c, members: [{ ...c, by: 'primary', shared: null }], by: 'serp' });

  it('Improve when a page of ours ranks or is the target, Create when none, Hold a town page with no installs', () => {
    const improve = planGroup(group(cand({ key: 'solar panels cardiff', town: 'Cardiff', pos: 18, url: 'https://heliaxis.co.uk/solar-panels-cardiff' })), S, { areas, crm, anyInstall: true });
    expect(improve.action).toBe('improve');
    expect(improve.targetPage).toBe('https://heliaxis.co.uk/solar-panels-cardiff');

    const target = planGroup(group(cand({ key: 'battery storage', service: 'battery', targetPage: '/battery-storage' })), S, { areas, crm, anyInstall: true });
    expect(target.action).toBe('improve');

    const create = planGroup(group(cand({ key: 'solar panels cardiff', town: 'Cardiff' })), S, { areas, crm, anyInstall: true });
    expect(create.action).toBe('create');
    expect(create.pageType).toBe('town');

    const hold = planGroup(group(cand({ key: 'solar panels swansea', town: 'Swansea' })), S, { areas, crm, anyInstall: true });
    expect(hold.action).toBe('hold');
    expect(hold.holdReason).toContain('No installs on record for Swansea');
    expect(hold.holdReason).toContain('SA4');
    expect(hold.holdReason).toContain('1 completed survey');
    expect(hold.inputs.proofWeight).toBe(0.3);

    const article = planGroup(group(cand({ key: 'do solar panels work in winter swansea', town: 'Swansea', intent: 'informational' })), S, { areas, crm, anyInstall: true });
    expect(article.action).toBe('create'); // only town pages and case studies need local proof
  });
});

describe('score', () => {
  it('is volume × position gain × intent × proof ÷ difficulty band', () => {
    expect(difficultyBand(null, S)).toBe(2);
    expect(difficultyBand(5, S)).toBe(1);
    expect(difficultyBand(15, S)).toBe(2);
    expect(difficultyBand(49, S)).toBe(3);
    expect(difficultyBand(85, S)).toBe(5);
    expect(positionGain(null)).toBe(0.28);
    expect(positionGain(1)).toBe(0);
    expect(positionGain(3)).toBe(0.18);
    expect(scoreOf({ volume: 1000, gain: 0.28, intentWeight: 3, proofWeight: 1, band: 2 })).toBe(420);
    expect(scoreOf({ volume: 1000, gain: 0.28, intentWeight: 3, proofWeight: 0.3, band: 2 })).toBe(126);
  });

  it('sums the group volume, counts unknown volumes at the default, and uses the best position', () => {
    const a = cand({ key: 'solar panels cardiff', town: 'Cardiff', volume: 400, pos: 12, url: 'https://heliaxis.co.uk/a', difficulty: 40 });
    const b = cand({ key: 'solar installers cardiff', town: 'Cardiff', volume: null, pos: 25 });
    const g: Group = { primary: a, members: [{ ...a, by: 'primary', shared: null }, { ...b, by: 'serp', shared: 5 }], by: 'serp' };
    const p = planGroup(g, S, { areas: [{ name: 'Cardiff', towns: ['Cardiff'], installs: 'yes' }], crm: {}, anyInstall: true });
    expect(p.inputs.volume).toBe(410);
    expect(p.inputs.bestPos).toBe(12);
    expect(p.inputs.band).toBe(3);
    expect(p.inputs.intentWeight).toBe(3);
    expect(p.score).toBe(Math.round(((410 * (0.28 - 0.01) * 3 * 1) / 3) * 10) / 10);
  });

  it('respects tuned weights', () => {
    const tuned = parsePlanner({ intentWeights: { local_commercial: 5 }, proofWeights: { without: 0 } });
    const c = cand({ key: 'solar panels swansea', town: 'Swansea' });
    const p = planGroup({ primary: c, members: [{ ...c, by: 'primary', shared: null }], by: 'serp' }, tuned, { areas: [], crm: {}, anyInstall: false });
    expect(p.inputs.intentWeight).toBe(5);
    expect(p.score).toBe(0);
  });
});

describe('queue stability and effort', () => {
  it('matches existing clusters by primary search, then tracked keyword, then old primary as member', () => {
    const m = matchExisting(
      [
        { key: 'solar panels cardiff', primaryKeywordId: 1, memberKeys: ['solar panels cardiff'] },
        { key: 'battery storage cardiff', primaryKeywordId: 9, memberKeys: ['battery storage cardiff'] },
        { key: 'heat pump cost', primaryKeywordId: null, memberKeys: ['heat pump cost', 'heat pump price'] },
        { key: 'new thing', primaryKeywordId: null, memberKeys: ['new thing'] },
      ],
      [
        { id: 10, key: 'solar panels cardiff', primaryKeywordId: 1 },
        { id: 11, key: 'home battery cardiff', primaryKeywordId: 9 },
        { id: 12, key: 'heat pump price', primaryKeywordId: null },
      ],
    );
    expect(m).toEqual([10, 11, 12, null]);
  });

  it('rates effort and quadrant', () => {
    expect(effortOf('pillar', 'create')).toBe(4);
    expect(effortOf('article', 'improve')).toBe(1);
    expect(quadrantOf(100, 1, 50)).toBe('quick_win');
    expect(quadrantOf(100, 4, 50)).toBe('big_bet');
    expect(quadrantOf(10, 1, 50)).toBe('fill_in');
    expect(quadrantOf(10, 3, 50)).toBe('later');
  });
});

describe('parsing', () => {
  it('reads Labs items from ideas, related and intersection shapes', () => {
    const ideas = parseLabsItems([{ items: [{ keyword: 'Solar Panels Cardiff', keyword_info: { search_volume: 320 }, keyword_properties: { keyword_difficulty: 18 }, search_intent_info: { main_intent: 'commercial' } }] }]);
    expect(ideas).toEqual([{ keyword: 'solar panels cardiff', volume: 320, difficulty: 18, intent: 'commercial', rivalPos: null, rivalUrl: null }]);
    const related = parseLabsItems([{ items: [{ keyword_data: { keyword: 'home battery', keyword_info: { search_volume: 90 } } }] }]);
    expect(related[0]).toMatchObject({ keyword: 'home battery', volume: 90, difficulty: null });
    const gap = parseLabsItems([{ items: [{ keyword_data: { keyword: 'solar bristol', keyword_info: { search_volume: 50 } }, first_domain_serp_element: { rank_group: 3, url: 'https://r.co.uk/b' } }] }]);
    expect(gap[0]).toMatchObject({ rivalPos: 3, rivalUrl: 'https://r.co.uk/b' });
    expect(parseLabsItems(null)).toEqual([]);
    expect(parseLabsItems([{ items: null }])).toEqual([]);
  });

  it('reads difficulty and intent', () => {
    expect(parseDifficulty([{ items: [{ keyword: 'a b', keyword_difficulty: 33 }, { keyword: 'c' }] }])).toEqual(new Map([['a b', 33]]));
    expect(parseIntent([{ items: [{ keyword: 'a', keyword_intent: { label: 'transactional', probability: 0.9 } }] }])).toEqual(new Map([['a', 'transactional']]));
  });

  it('finds Search Console striking distance (position 8 to 30, real impressions)', () => {
    const rows = [
      { query: 'solar panels newport', page: '/a', impressions: 30, position: 12 },
      { query: 'solar panels newport', page: '/b', impressions: 10, position: 16 },
      { query: 'heliaxis', page: '/', impressions: 200, position: 1.2 },
      { query: 'battery cardiff', page: '/c', impressions: 4, position: 15 },
      { query: 'ev charger', page: '/d', impressions: 50, position: 44 },
    ];
    const s = strikingDistance(rows, { from: 8, to: 30, minImpressions: 10 });
    expect(s).toEqual([{ keyword: 'solar panels newport', impressions: 40, pos: 13, url: '/a' }]);
  });

  it('picks the top rival installers from the latest top 10s', () => {
    const items = [{ domain: 'www.rival-a.co.uk' }, { domain: 'rival-a.co.uk' }, { domain: 'checkatrade.com' }, { domain: 'heliaxis.co.uk' }, { domain: 'rival-b.co.uk' }, { domain: null }];
    expect(topRivals(items, 8)).toEqual(['rival-a.co.uk', 'rival-b.co.uk']);
  });
});

describe('research steps', () => {
  it('lists bounded steps with a pre-flight estimate', () => {
    const steps = researchSteps(['a.co.uk', 'b.co.uk'], ['solar panels']);
    expect(steps.map((s) => s.id)).toEqual(['free', 'gap:a.co.uk', 'gap:b.co.uk', 'ideas', 'related:solar panels', 'difficulty', 'intent']);
    expect(steps[0].paid).toBe(false);
    expect(estimateOf(steps)).toBeGreaterThan(0);
    expect(estimateOf(steps)).toBeLessThan(1);
    expect(relatedSeedsFor(['battery', 'solar'])).toEqual(['solar panels', 'home battery storage']);
    expect(relatedSeedsFor([])).toHaveLength(5);
    expect(ideaSeedsFor(['ev'], ['EV charger Cardiff', 'ev charger installation'])).toEqual(['ev charger installation', 'home ev charger', 'ev charger cardiff']);
  });
});
