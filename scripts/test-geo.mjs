// The GEO bot's pure parts (src/lib/geo/shared.ts): spotting Heliaxis in an answer and its sources,
// where it ranks, the scores, settings, page text for the analyst, and plain-text cleaning.
// Usage: node --experimental-strip-types scripts/test-geo.mjs
import assert from 'node:assert/strict';

const g = await import('../src/lib/geo/shared.ts');

// Named and cited.
assert.deepEqual(g.scoreAnswer('Try Heliaxis in Newport.', []), { mentioned: true, cited: false });
assert.deepEqual(g.scoreAnswer('Try HELIAXIS LTD.', [{ url: 'https://www.heliaxis.co.uk/solar' }]), { mentioned: true, cited: true });
assert.deepEqual(g.scoreAnswer('See https://heliaxis.co.uk/book-a-survey for more', []), { mentioned: true, cited: true });
assert.deepEqual(g.scoreAnswer('Heliaxisolar is someone else', []), { mentioned: false, cited: false });
// A lookalike domain is not ours.
assert.equal(g.isOwnUrl('https://heliaxis.co.uk.evil.com/'), false);
assert.equal(g.isOwnUrl('https://notheliaxis.co.uk/'), false);
assert.equal(g.isOwnUrl('not a url'), false);
assert.deepEqual(g.scoreAnswer('Other installers', [{ url: 'https://notheliaxis.co.uk' }]), { mentioned: false, cited: false });

// Rank among the businesses named.
assert.equal(g.brandRank(['Solar Co', 'Heliaxis Ltd', 'Another']), 2);
assert.equal(g.brandRank(['Solar Co']), null);

// Sources: once each, fragments dropped, only web links, capped.
assert.deepEqual(
  g.dedupeSources([{ url: 'https://a.com/x#y', title: 'A' }, { url: 'https://a.com/x' }, { url: 'ftp://b' }, { url: '' }]),
  [{ url: 'https://a.com/x', title: 'A' }]
);
assert.equal(g.dedupeSources(Array.from({ length: 50 }, (_, i) => ({ url: `https://a.com/${i}` })), 30).length, 30);

// Scores, counting only answered checks.
const t = g.tally([
  { engine: 'claude', status: 'done', mentioned: true, cited: true },
  { engine: 'claude', status: 'done', mentioned: false, cited: false },
  { engine: 'openrouter:perplexity/sonar', status: 'done', mentioned: true, cited: false },
  { engine: 'openrouter:perplexity/sonar', status: 'failed', mentioned: null, cited: null },
]);
assert.deepEqual(t.all, { total: 3, mentioned: 2, cited: 1 });
assert.deepEqual(t.byEngine.claude, { total: 2, mentioned: 1, cited: 1 });
assert.equal(g.pct(1, 3), 33);
assert.equal(g.pct(0, 0), 0);

// Engine names.
assert.equal(g.engineLabel('claude'), 'Claude');
assert.equal(g.engineLabel('openrouter:perplexity/sonar'), 'Perplexity (sonar)');
assert.equal(g.engineLabel('openrouter:openai/gpt-4o-search-preview'), 'ChatGPT (gpt-4o search)');

// Settings: defaults, bounds, junk.
assert.deepEqual(g.parseSettings(null), { everyDays: 7, autoMeta: false });
assert.deepEqual(g.parseSettings('{"everyDays":0,"autoMeta":true}'), { everyDays: 0, autoMeta: true });
assert.deepEqual(g.parseSettings({ everyDays: 999, autoMeta: 'yes' }), { everyDays: 7, autoMeta: false });
assert.deepEqual(g.parseSettings('not json'), { everyDays: 7, autoMeta: false });

// Page text for the analyst.
assert.equal(
  g.htmlText('<style>.x{}</style><h2>Solar &amp; batteries</h2><p>Hello<br>there</p><script>alert(1)</script>'),
  'Solar & batteries. Hello there.'
);
assert.equal(g.htmlText('<p>' + 'a'.repeat(50) + '</p>', 10), 'aaaaaaaaaa…');

// Plain text for meta tags and FAQ answers.
assert.equal(g.plain('<b>Hi</b>\n there\u0000', 100), 'Hi there');
assert.equal(g.plain('abcdef', 3), 'abc');
assert.equal(g.sameQuestion('Is solar worth it?', 'is SOLAR worth it'), true);

// Paths.
assert.equal(g.normPath(''), '/');
assert.equal(g.normPath('/'), '/');
assert.equal(g.normPath('solar-panels/'), '/solar-panels');
assert.equal(g.normPath('/blog/x'), '/blog/x');

console.log('test-geo: all passed');
