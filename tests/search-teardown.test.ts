import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPageFacts,
  classifyPage,
  isoDate,
  normName,
  parseBusinessInfo,
  parseContentParsing,
  parseHtmlExtras,
  parseInstantPages,
  parseLighthouse,
  parseReviews,
  robotsAllows,
  sameName,
  townLinkCount,
  triedRecently,
  addTry,
  unsavedFactsRow,
  type PageFactsRow,
} from '@/lib/search/teardown/parse';
import { badNumbers, buildCard, buildPrompt, checkWriteup, factNumbers, median, parseWriteup, src, type BusinessFact, type CardInput } from '@/lib/search/teardown/card';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, `fixtures/teardown-${name}.json`), 'utf8')) as unknown;
const TOWNS = ['Cardiff', 'Newport', 'Bridgend', 'Swansea', 'Penarth', 'Barry', 'Newport (Pembs)'];

describe('robots.txt', () => {
  const body = `# robots
User-agent: *
Disallow: /admin
Disallow: /*?print=
Allow: /admin/public

User-agent: DataForSeoBot
User-agent: OtherBot
Disallow: /private
`;
  it('uses the group that names the crawler, else the * group, longest rule wins', () => {
    expect(robotsAllows(body, 'https://x.co.uk/admin/thing', ['someone'])).toBe(false);
    expect(robotsAllows(body, 'https://x.co.uk/admin/public/page', ['someone'])).toBe(true);
    expect(robotsAllows(body, 'https://x.co.uk/page?print=1', ['someone'])).toBe(false);
    // DataForSeoBot has its own group, which does not block /admin.
    expect(robotsAllows(body, 'https://x.co.uk/admin/thing', ['dataforseobot'])).toBe(true);
    expect(robotsAllows(body, 'https://x.co.uk/private/a', ['dataforseobot'])).toBe(false);
  });
  it('allows everything with an empty file or a blank Disallow', () => {
    expect(robotsAllows('', 'https://x.co.uk/a')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow:\n', 'https://x.co.uk/a')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /\n', 'https://x.co.uk/a')).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow: /*.pdf$\n', 'https://x.co.uk/a.pdf')).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow: /*.pdf$\n', 'https://x.co.uk/a.pdf.html')).toBe(true);
  });
});

describe('page type', () => {
  it('reads the domain lists first', () => {
    expect(classifyPage({ url: 'https://www.gov.uk/smart-export-guarantee' })).toBe('government');
    expect(classifyPage({ url: 'https://www.gov.wales/nest' })).toBe('government');
    expect(classifyPage({ url: 'https://www.checkatrade.com/Search/Solar-Panel-Installer/in/Cardiff' })).toBe('directory');
    expect(classifyPage({ url: 'https://mcscertified.com/find-an-installer/' })).toBe('directory');
    expect(classifyPage({ url: 'https://www.which.co.uk/trusted-traders/solar' })).toBe('directory');
    expect(classifyPage({ url: 'https://www.which.co.uk/reviews/solar-panels/article/x' })).toBe('guide');
    expect(classifyPage({ url: 'https://www.tesla.com/en_gb/powerwall' })).toBe('manufacturer');
    expect(classifyPage({ url: 'https://www.facebook.com/rivalsolar' })).toBe('other');
  });
  it('then URL and heading cues for installers', () => {
    expect(classifyPage({ url: 'https://rival.co.uk/blog/solar-costs', h1: 'Solar costs' })).toBe('guide');
    expect(classifyPage({ url: 'https://rival.co.uk/solar', h1: 'How much do solar panels cost?' })).toBe('guide');
    expect(classifyPage({ url: 'https://rival.co.uk/solar-panels-cardiff/', h1: 'Solar panels', towns: TOWNS })).toBe('town');
    expect(classifyPage({ url: 'https://rival.co.uk/solar', h1: 'Solar panel installers in Newport', towns: TOWNS })).toBe('town');
    expect(classifyPage({ url: 'https://rival.co.uk/solar-panels/', h1: 'Solar panel installation', towns: TOWNS })).toBe('service');
    expect(classifyPage({ url: 'https://heliaxis.co.uk/', h1: 'Heliaxis', towns: TOWNS })).toBe('service');
  });
});

describe('On-Page parsing (fixtures)', () => {
  const instant = parseInstantPages(fx('instant-pages'))!;
  const content = parseContentParsing(fx('content-parsing'))!;

  it('reads instant_pages', () => {
    expect(instant.status).toBe(200);
    expect(instant.words).toBe(1462);
    expect(instant.images).toBe(14);
    expect(instant.headings.filter((h) => h.level === 2)).toHaveLength(4);
    expect(instant.modifiedAt).toBe('2026-11-04T09:12:00.000Z');
    expect(instant.hasMicromarkup).toBe(true);
  });

  it('reads content_parsing', () => {
    expect(content.author).toBe('Jane Davies');
    expect(content.ratings).toBe(1);
    expect(content.headings.map((h) => h.text)).toContain('Is solar worth it in Wales?');
    expect(content.links).toContain('https://www.rivalsolar.co.uk/solar-panels-swansea/');
    expect(content.text).toMatch(/£5,995/);
  });

  it('builds one seo_page_facts row', () => {
    const html = parseHtmlExtras(
      `<html><head><meta property="article:published_time" content="2025-03-02T10:00:00Z">
       <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":["LocalBusiness","Electrician"],"name":"Rival"},{"@type":"FAQPage","mainEntity":[]},{"@type":"Article","author":{"@type":"Person","name":"J Davies"},"datePublished":"2025-03-01"}]}</script>
       <script type="application/ld+json">{ broken json </script></head>
       <body><iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe><a href="/solar-panels-penarth/">Penarth</a></body></html>`,
      'https://www.rivalsolar.co.uk/solar-panels-cardiff/',
    );
    expect(html.schema).toEqual(['Article', 'Electrician', 'FAQPage', 'LocalBusiness', 'Person']);
    expect(html.hasVideo).toBe(true);
    expect(html.publishedAt).toBe('2025-03-01T00:00:00.000Z');

    const row = buildPageFacts({ url: 'https://www.rivalsolar.co.uk/solar-panels-cardiff/', towns: TOWNS, instant, content, html });
    expect(row.domain).toBe('rivalsolar.co.uk');
    expect(row.page_type).toBe('town');
    expect(row.h1).toBe('Solar Panel Installers in Cardiff');
    expect(row.words).toBe(1462);
    expect(row.mentions_mcs).toBe(true);
    expect(row.prices_shown).toBe(true);
    expect(row.reviews_on_page).toBe(true);
    expect(row.has_video).toBe(true);
    expect(row.author).toBe('Jane Davies');
    expect(row.questions).toEqual(expect.arrayContaining(['Why choose an MCS certified installer?', 'How much do solar panels cost in Cardiff?', 'Do I need planning permission?', 'Is solar worth it in Wales?']));
    expect(row.town_mentions.Cardiff).toBeGreaterThanOrEqual(5);
    expect(row.town_mentions.Penarth).toBe(1);
    expect(row.town_mentions['Newport (Pembs)']).toBeUndefined();
    // Newport, Bridgend, Swansea and Penarth pages on the same site; the page itself does not count.
    expect(row.town_links).toBe(4);
    expect(row.schema).toContain('FAQPage');
    expect(row.error).toBeNull();
    expect(row.content_hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('a page nobody could read has nulls, not zeros', () => {
    const row = buildPageFacts({ url: 'https://blocked.co.uk/x', towns: TOWNS, instant: null, content: null, error: 'robots.txt asks crawlers not to read this page' });
    expect(row.words).toBeNull();
    expect(row.mentions_mcs).toBeNull();
    expect(row.prices_shown).toBeNull();
    expect(row.error).toMatch(/robots/);
  });

  it('reads empty and failed answers without throwing', () => {
    expect(parseInstantPages({})).toBeNull();
    expect(parseContentParsing({ result: [{ items: [] }] })).toBeNull();
    expect(parseLighthouse({})).toBeNull();
  });

  it('reads the Lighthouse score', () => {
    expect(parseLighthouse(fx('lighthouse'))).toBe(67);
  });

  it('counts only same-site town pages', () => {
    expect(townLinkCount('https://a.co.uk/x', ['https://a.co.uk/solar-cardiff', 'https://b.co.uk/solar-cardiff', 'https://a.co.uk/about', 'https://a.co.uk/solar-cardiff/'], TOWNS)).toBe(1);
  });
});

describe('Business Data parsing (fixtures)', () => {
  it('reads a profile', () => {
    const b = parseBusinessInfo(fx('business-info'))!;
    expect(b).toMatchObject({ cid: '1941234567890123456', place_id: 'ChIJ1234567890abcdef', name: 'Rival Solar Ltd', domain: 'rivalsolar.co.uk', primary_category: 'Solar energy contractor', rating: 4.9, reviews: 212, photos: 87, claimed: true });
    expect(b.categories).toEqual(['Solar energy contractor', 'Electrician', 'Solar energy equipment supplier']);
    expect(parseBusinessInfo({ result: [{ items: null }] })).toBeNull();
  });

  it('counts reviews in the last 90 days', () => {
    const p = parseReviews(fx('reviews'), new Date('2026-11-19T12:00:00Z'))!;
    // 15 Nov, 20 Oct and 1 Sep are inside 90 days; 1 Jul and 10 Mar are not.
    expect(p.reviews90d).toBe(3);
    expect(p.capped).toBe(false);
    expect(p.read).toBe(5);
    expect(p.respondedPct).toBe(40);
    expect(p.reviews).toBe(212);
    expect(p.newest).toBe('2026-11-15T10:00:00.000Z');
  });

  it('matches business names', () => {
    expect(normName('Rival Solar Ltd.')).toBe('rival solar');
    expect(sameName('Rival Solar Ltd', 'RIVAL SOLAR')).toBe(true);
    expect(sameName('Heliaxis', 'Heliaxis Ltd - Solar & Battery Installers')).toBe(true);
    expect(sameName('Sun', 'Sunshine Solar')).toBe(false);
    expect(sameName('Solar Wales', 'Solar Wales Group')).toBe(true);
    expect(sameName('Green Energy', 'Blue Energy')).toBe(false);
  });

  it('reads DataForSEO dates', () => {
    expect(isoDate('2026-11-01 10:00:00 +00:00')).toBe('2026-11-01T10:00:00.000Z');
    expect(isoDate('nonsense')).toBeNull();
    expect(isoDate('1970-01-01')).toBeNull();
  });
});

/* ── The card ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const page = (url: string, over: Partial<PageFactsRow> = {}): PageFactsRow => ({
  url,
  domain: new URL(url).hostname.replace(/^www\./, ''),
  status: 200,
  page_type: 'service',
  title: 't',
  words: 1000,
  h1: 'h',
  headings: [{ level: 2, text: 'A' }],
  questions: [],
  schema: [],
  images: 5,
  has_video: false,
  prices_shown: false,
  reviews_on_page: false,
  author: null,
  published_at: null,
  modified_at: null,
  town_mentions: {},
  town_links: 0,
  mentions_mcs: false,
  internal_links: 10,
  external_links: 1,
  lighthouse_perf: null,
  content_hash: null,
  text_sample: null,
  error: null,
  ...over,
});

function sampleInput(): CardInput {
  const date = '2026-11-16';
  const urls = ['https://a.co.uk/cardiff', 'https://b.co.uk/solar', 'https://www.checkatrade.com/x', 'https://c.co.uk/', 'https://heliaxis.co.uk/solar-panels-cardiff'];
  const facts = new Map<string, PageFactsRow>([
    [urls[0], page(urls[0], { words: 1450, mentions_mcs: true, prices_shown: true, schema: ['LocalBusiness', 'FAQPage'], questions: ['How much?', 'Is it worth it?'], page_type: 'town', town_mentions: { Cardiff: 9 }, modified_at: '2026-10-01T00:00:00Z' })],
    [urls[1], page(urls[1], { words: 2100, mentions_mcs: true, prices_shown: false, schema: ['LocalBusiness'], town_mentions: { Cardiff: 3 } })],
    [urls[2], page(urls[2], { words: 600, page_type: 'directory', reviews_on_page: true, mentions_mcs: false })],
    [urls[3], page(urls[3], { words: null, error: 'DataForSEO could not read the page' })],
    [urls[4], page(urls[4], { words: 941, mentions_mcs: false, schema: ['Organization'], town_mentions: { Cardiff: 2 } })],
  ]);
  const businesses: BusinessFact[] = [
    { id: 1, name: 'A Solar Ltd', isOurs: false, website: 'https://a.co.uk', snapDate: '2026-11-17', rating: 4.9, reviews: 84, reviews90d: 6, photos: 40 },
    { id: 2, name: 'B Renewables', isOurs: false, website: null, snapDate: '2026-11-17', rating: 4.7, reviews: 120, reviews90d: 10, photos: 12 },
    { id: 3, name: 'Heliaxis', isOurs: true, website: 'https://heliaxis.co.uk', snapDate: '2026-11-17', rating: 5, reviews: 23, reviews90d: 4, photos: 30 },
  ];
  return {
    keyword: { id: 41, phrase: 'solar panels cardiff', town: 'Cardiff' },
    date,
    result: { our_pos: 34, our_pack_pos: null, our_url: urls[4] },
    items: [
      { pos: 1, type: 'organic', domain: 'a.co.uk', url: urls[0], title: 'A' },
      { pos: 2, type: 'organic', domain: 'b.co.uk', url: urls[1], title: 'B' },
      { pos: 3, type: 'organic', domain: 'checkatrade.com', url: urls[2], title: 'C' },
      { pos: 4, type: 'organic', domain: 'c.co.uk', url: urls[3], title: 'D' },
      { pos: 34, type: 'organic', domain: 'heliaxis.co.uk', url: urls[4], title: 'Us' },
      { pos: 1, type: 'local_pack', domain: null, url: null, title: 'A Solar' },
      { pos: 2, type: 'local_pack', domain: null, url: null, title: 'B Renewables' },
      { pos: 3, type: 'local_pack', domain: null, url: null, title: 'Unknown Electrics' },
    ],
    facts,
    ourPage: { url: urls[4], from: 'ranking' },
    businesses,
    ourBusiness: businesses[2],
    now: new Date('2026-11-19T00:00:00Z'),
  };
}

describe('What it takes card', () => {
  const card = buildCard(sampleInput());
  const m = (k: string) => card.metrics.find((x) => x.key === k)!;

  it('medians', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('takes the figures from the readable rival pages only, and ours apart', () => {
    expect(card.top10).toHaveLength(4); // position 34 is not in the top 10
    expect(m('words')).toMatchObject({ value: 1450, of: 3, ours: 941 });
    expect(m('mcs_heading')).toMatchObject({ value: 2, of: 3, oursHas: false });
    expect(m('prices')).toMatchObject({ value: 1, of: 3 });
    expect(m('town_mentions')).toMatchObject({ value: 3, ours: 2 });
    expect(m('dated')).toMatchObject({ value: 1 });
    expect(card.pageTypes).toEqual({ town: 1, service: 2, directory: 1 });
    expect(card.schemaTypes[0]).toMatchObject({ type: 'LocalBusiness', count: 2, ours: false });
  });

  it('carries the rows each number came from', () => {
    expect(m('words').from).toEqual([src.page('https://a.co.uk/cardiff'), src.page('https://b.co.uk/solar'), src.page('https://www.checkatrade.com/x')]);
    expect(m('mcs_heading').from).toEqual([src.page('https://a.co.uk/cardiff'), src.page('https://b.co.uk/solar')]);
    expect(m('words').oursFrom).toEqual([src.page('https://heliaxis.co.uk/solar-panels-cardiff')]);
    expect(m('pack_reviews').from).toEqual(['seo_business_snapshot:1@2026-11-17', 'seo_business_snapshot:2@2026-11-17']);
    expect(card.basis).toContain('seo_serp_result:41@2026-11-16/mobile');
    // Every source names a stored table.
    for (const x of card.metrics) for (const s of [...x.from, ...x.oursFrom]) expect(s).toMatch(/^(seo_page_facts|seo_business_snapshot):/);
  });

  it('map pack against ours', () => {
    expect(m('pack_reviews')).toMatchObject({ value: 102, of: 2, ours: 23 });
    expect(m('pack_rating')).toMatchObject({ value: 4.8, ours: 5 });
    expect(m('pack_website')).toMatchObject({ value: 1, of: 2, oursHas: true });
    expect(card.pack.find((p) => p.name === 'Unknown Electrics')?.businessId).toBeNull();
  });

  it('no pack, no pack lines', () => {
    const input = sampleInput();
    input.items = input.items.filter((i) => i.type !== 'local_pack');
    expect(buildCard(input).metrics.some((x) => x.key.startsWith('pack_'))).toBe(false);
  });
});

describe('The write-up check', () => {
  const card = buildCard(sampleInput());

  it('allows the numbers on the card and the gaps between them', () => {
    const nums = factNumbers(card);
    expect(nums).toEqual(expect.arrayContaining([1450, 941, 509, 2, 3, 102, 23, 79, 10]));
    expect(badNumbers('Median 1,450 words against our 941, 509 more.', card)).toEqual([]);
    expect(badNumbers('2 of 3 rival pages name MCS in a heading.', card)).toEqual([]);
    expect(badNumbers('H2: Solar panel costs in Cardiff', card)).toEqual([]);
  });

  it('rejects any line with a number not in the facts', () => {
    const checked = checkWriteup(
      {
        shared: ['Most winners name MCS in a heading (2 of 3).', 'They have been trading for 15 years.'],
        gaps: ['Our page has 941 words against a median of 1,450.', 'We have 7,000 fewer reviews.'],
        outline: ['H1: Solar panel installers in Cardiff', 'H2: What 9kW costs'],
      },
      card,
    );
    expect(checked.shared).toEqual(['Most winners name MCS in a heading (2 of 3).']);
    expect(checked.gaps).toEqual(['Our page has 941 words against a median of 1,450.']);
    expect(checked.outline).toEqual(['H1: Solar panel installers in Cardiff']);
    expect(checked.rejected.map((r) => r.numbers)).toEqual([['15'], ['7000'], ['9']]);
  });

  it('parses the model answer', () => {
    expect(parseWriteup('```json\n{"shared":["a"],"gaps":["b"],"outline":["H1: c"]}\n```')).toEqual({ shared: ['a'], gaps: ['b'], outline: ['H1: c'] });
    expect(parseWriteup('not json')).toBeNull();
    expect(parseWriteup('{"shared":[],"gaps":[],"outline":[]}')).toBeNull();
  });

  it('the prompt carries facts, never page text or HTML', () => {
    const pages = [...sampleInput().facts.values()].map((p) => ({ ...p, text_sample: 'SECRET PAGE TEXT', headings: [{ level: 2, text: 'Costs' }] }));
    const prompt = buildPrompt(card, pages, ['15']);
    expect(prompt).not.toMatch(/SECRET PAGE TEXT/);
    expect(prompt).not.toMatch(/<html|<script/i);
    expect(prompt).toMatch(/"medianOfRivals":1450/);
    expect(prompt).toMatch(/not in the facts: 15/);
    expect(prompt).toMatch(/MCS, RECC and NAPIT/);
  });
});

describe('paid calls that saved nothing are not bought again', () => {
  it('marks an unsaved page read with an error row', () => {
    const r = unsavedFactsRow('https://www.rival.co.uk/solar', '2026-11-19T10:00:00Z', 'value too long');
    expect(r).toEqual({ url: 'https://www.rival.co.uk/solar', domain: 'rival.co.uk', fetched_at: '2026-11-19T10:00:00Z', error: 'Read, but saving the facts failed: value too long' });
  });
  it('remembers a profile lookup by name and day for a week', () => {
    const tries = addTry([], 'Sunny Solar Ltd', '2026-11-19', 'not saved');
    expect(triedRecently(tries, 'Sunny Solar Ltd', '2026-11-19')).toBe(true);
    expect(triedRecently(tries, 'Sunny Solar Ltd', '2026-11-25')).toBe(true);
    expect(triedRecently(tries, 'Sunny Solar Ltd', '2026-11-26')).toBe(false);
    expect(triedRecently(tries, 'Other Solar', '2026-11-19')).toBe(false);
    // Old tries drop out; the same name and day is replaced, not repeated.
    expect(addTry(addTry(tries, 'Sunny Solar Ltd', '2026-11-19', 'again'), 'X', '2026-11-30', 'n').map((t) => t.date)).toEqual(['2026-11-30']);
    expect(addTry(tries, 'Sunny Solar Ltd', '2026-11-19', 'again')).toHaveLength(1);
  });
});
