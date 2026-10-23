// The CMS report's pure parts (src/lib/report/shared.ts): reading Google's results, who beats us,
// the map pack, a page's on-page signals, which addresses may be fetched, Search Console sums, settings.
// Usage: node --experimental-strip-types scripts/test-report.mjs
import assert from 'node:assert/strict';

const r = await import('../src/lib/report/shared.ts');

// A DataForSEO result: organic, a map pack, and other types ignored.
const raw = {
  item_types: ['local_pack', 'organic', 'people_also_ask', 'organic'],
  items: [
    { type: 'local_pack', rank_group: 1, title: 'Sunny Solar', domain: 'sunnysolar.co.uk', rating: { value: 4.9, votes_count: 210 } },
    { type: 'local_pack', rank_group: 2, title: 'Heliaxis Ltd', domain: '', rating: { value: 5, votes_count: 12 } },
    { type: 'organic', rank_group: 1, domain: 'www.checkatrade.com', url: 'https://www.checkatrade.com/x', title: 'Checkatrade' },
    { type: 'organic', rank_group: 2, domain: 'sunnysolar.co.uk', url: 'https://sunnysolar.co.uk/newport', title: 'Solar Newport' },
    { type: 'people_also_ask', rank_group: 1 },
    { type: 'organic', rank_group: 3, domain: 'www.heliaxis.co.uk', url: 'https://heliaxis.co.uk/solar', title: 'Heliaxis solar' },
    { type: 'organic', rank_group: 4, domain: 'other.co.uk', url: 'https://other.co.uk/', title: 'Other' },
  ],
};
const s = r.parseSerp('solar panels', 'Newport,Wales,United Kingdom', raw);
assert.equal(s.ours, 3);
assert.equal(s.ourUrl, 'https://heliaxis.co.uk/solar');
assert.equal(s.oursLocal, 2, 'found in the map pack by name');
assert.equal(s.organic.length, 4);
assert.equal(s.organic[0].domain, 'checkatrade.com');
assert.deepEqual(s.local[0], { pos: 1, title: 'Sunny Solar', domain: 'sunnysolar.co.uk', rating: 4.9, reviews: 210 });
assert.deepEqual(s.features, ['local_pack', 'organic', 'people_also_ask']);
assert.equal(r.parseSerp('x', 'y', null).ours, null);

// Who beats us: directories out, counted per search, "above us" when we're absent too.
const s2 = r.parseSerp('battery storage', 'Cardiff,Wales,United Kingdom', {
  items: [
    { type: 'organic', rank_group: 1, domain: 'sunnysolar.co.uk', url: 'https://sunnysolar.co.uk/battery', title: 'Batteries' },
    { type: 'organic', rank_group: 2, domain: 'sunnysolar.co.uk', url: 'https://sunnysolar.co.uk/b2', title: 'Batteries 2' },
  ],
});
const v = r.rivals([s, s2]);
assert.equal(v[0].domain, 'sunnysolar.co.uk');
assert.equal(v[0].appearances, 2, 'one per search, not per result');
assert.equal(v[0].beatsUs, 2);
assert.equal(v[0].top3, 2);
assert.equal(v[0].avgPos, 1.5);
assert.equal(v[0].bestUrl, 'https://sunnysolar.co.uk/battery');
assert.equal(v[0].localPack, 1);
assert.equal(v.find((x) => x.domain === 'other.co.uk').beatsUs, 0);
assert.ok(!v.some((x) => x.domain === 'checkatrade.com'));
assert.equal(r.localLeaders([s])[0].title, 'Sunny Solar');

assert.equal(r.isOurs('https://www.heliaxis.co.uk/x'), true);
assert.equal(r.isOurs('heliaxis.co.uk.evil.com'), false);
assert.equal(r.isDirectory('uk.trustpilot.com'), true);
assert.equal(r.town('Newport,Wales,United Kingdom'), 'Newport');

// On-page signals.
const html = `<!doctype html><html><head><title>Solar Panels Newport | Sunny</title>
<meta name="description" content="Solar in Newport &amp; Cardiff">
<link rel="canonical" href="https://sunnysolar.co.uk/newport">
<script type="application/ld+json">{"@context":"https://schema.org","@type":["LocalBusiness","Organization"],"review":{"@type":"Review"}}</script>
</head><body><h1>Solar panels in Newport</h1><h2>FAQs</h2><p>MCS certified installer in Newport and Cardiff. Read our reviews.</p>
<img src="a.jpg" alt="roof"><img src="b.jpg"><a href="/about">About</a><a href="https://other.com/">x</a><a href="tel:123">call</a>
<script>var newport = 1;</script></body></html>`;
const a = r.auditHtml(html, 'https://sunnysolar.co.uk/newport', ['Newport', 'Cardiff', 'Swansea']);
assert.equal(a.title, 'Solar Panels Newport | Sunny');
assert.equal(a.description, 'Solar in Newport & Cardiff');
assert.deepEqual(a.h1, ['Solar panels in Newport']);
assert.deepEqual(a.schema.sort(), ['LocalBusiness', 'Organization', 'Review']);
assert.equal(a.faq, true);
assert.deepEqual(a.towns, { Newport: 2, Cardiff: 1 }, 'scripts are not counted');
assert.deepEqual(a.accreditations, ['MCS']);
assert.equal(a.reviewsMentioned, true);
assert.equal(a.images, 2);
assert.equal(a.imagesNoAlt, 1);
assert.equal(a.internalLinks, 1);
assert.equal(a.externalLinks, 1);
assert.equal(a.canonical, 'https://sunnysolar.co.uk/newport');
assert.ok(a.words > 10);

// Only public web addresses are fetched.
for (const ok of ['https://sunnysolar.co.uk/x', 'http://a.b.com/']) assert.equal(r.fetchable(ok), true, ok);
for (const bad of ['http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.1/x', 'https://a.com:8443/', 'file:///etc/passwd', 'http://[::1]/', 'http://intranet/', 'https://user:pw@a.com/', 'http://metadata.google.internal/'])
  assert.equal(r.fetchable(bad), false, bad);

// Search Console.
const rows = [
  { keys: ['a'], clicks: 10, impressions: 100, ctr: 0.1, position: 2 },
  { keys: ['b'], clicks: 0, impressions: 300, ctr: 0, position: 12 },
  { keys: ['c'], clicks: 1, impressions: 5, ctr: 0.2, position: 6 },
];
assert.deepEqual(r.gscTotals(rows), { clicks: 11, impressions: 405, ctr: 11 / 405, position: 9.5 });
assert.deepEqual(r.strikingDistance(rows).map((x) => x.keys[0]), ['b']);
assert.equal(r.isoDay(new Date('2026-03-02T10:00:00Z'), 3), '2026-02-27');

// Settings.
const def = r.parseReportSettings(null);
assert.equal(def.everyDays, 30);
assert.ok(def.keywords.length && def.locations.length);
const p = r.parseReportSettings({ keywords: [' solar  panels ', 'solar panels', ''], locations: [], everyDays: 7 });
assert.deepEqual(p.keywords, ['solar panels']);
assert.deepEqual(p.locations, []);
assert.equal(p.everyDays, 7);
assert.equal(r.parseReportSettings({ everyDays: -1 }).everyDays, 30);

console.log('test-report: all passed');
