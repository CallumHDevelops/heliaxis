// Meta ads renamed in Ads Manager (src/lib/ad-names.ts, and spendTable in src/lib/ad-spend.ts):
// the names each ad has had, Meta's names now over the figures' own, leads that came in under an
// old name staying with their ad (shared and reused names too), the lookup other pages can use,
// and which older leads to ask Meta's Lead API for their ad, and what its answers mean.
// Usage: node --experimental-strip-types scripts/test-ad-names.mjs
import {
  currentFromRows,
  emptyHistory,
  leadAdName,
  leadsToBackfill,
  mergeHistory,
  nameLookup,
  namesById,
  noteAds,
  noteName,
  pastNames,
  readHistory,
  readLeadBatch,
  readMisses,
  trimHistory,
  withCurrentNames,
} from '../src/lib/ad-names.ts';
import { spendTable } from '../src/lib/ad-spend.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const yes = (name, cond) => eq(name, !!cond, true);

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T = Date.parse('2026-10-20T10:00:00Z');

// ── The names each ad has had ──
const h = emptyHistory();
eq('a new name is news', noteName(h, 'ads', '101', 'Video 4', T - DAY), true);
eq('the same name again within the hour isn’t (cms_kv not rewritten every load)', noteName(h, 'ads', '101', ' video  4 ', T - DAY + 30 * MIN), false);
eq('…but its time moves on', h.ads['101'][0].at, T - DAY + 30 * MIN);
eq('seen again over an hour later is news, with Meta’s spelling now', [noteName(h, 'ads', '101', 'Video 4 ', T - DAY + 2 * HOUR), h.ads['101'][0].name], [true, 'Video 4']);
eq('an older sighting changes nothing', noteName(h, 'ads', '101', 'Video 4', T - 5 * DAY), false);
eq('a second name for the same ad', noteName(h, 'ads', '101', 'Valley Vets Off Grid', T), true);
eq('names newest first', namesById(h, 'ads')['101'], ['Valley Vets Off Grid', 'Video 4']);
eq('no id, no name, odd ids and bad times are ignored', [
  noteName(h, 'ads', '', 'X', T),
  noteName(h, 'ads', '102', '  ', T),
  noteName(h, 'ads', '__proto__', 'X', T),
  noteName(h, 'ads', 'a b', 'X', T),
  noteName(h, 'ads', '102', 'X', NaN),
], [false, false, false, false, false]);
eq('an id that’s a property name on every object is still just an id', [noteName(h, 'ads', 'constructor', 'X', T), h.ads.constructor], [true, [{ name: 'X', at: T }]]);
delete h.ads.constructor;
yes('…and nothing leaks onto Object', !Object.prototype.X && !{}.ads);

const ad = (id, name, campaignId, campaignName, spend, metaLeads = 0) => ({ id, name, campaignId, campaignName, spend, impressions: 0, clicks: 0, metaLeads });
const h2 = emptyHistory();
eq('ads in figures: their names and their campaigns’', [noteAds(h2, [ad('1', 'Video 1', '9', 'TGM First Campaign', 0)], T), namesById(h2, 'campaigns')], [true, { 9: ['TGM First Campaign'] }]);
eq('not the stand-ins for names Meta didn’t send', [noteAds(h2, [ad('2', 'Ad 2', '8', 'Campaign 8', 0), ad('3', 'Ad 3', '', 'No campaign', 0)], T), Object.keys(h2.ads), Object.keys(h2.campaigns)], [false, ['1'], ['9']]);

eq('cms_kv copy round trip', readHistory(JSON.parse(JSON.stringify(h))), h);
eq('nothing, nonsense or another version → empty', [readHistory(null), readHistory('x'), readHistory({ v: 2, ads: { 1: [{ name: 'A', at: 1 }] } })], [emptyHistory(), emptyHistory(), emptyHistory()]);
eq('unreadable entries left out', readHistory({ v: 1, ads: { 1: [{ name: 'A', at: 5 }, { name: '', at: 5 }, { at: 3 }, 'x'], '__proto__': [{ name: 'B', at: 1 }], 2: 'nope' }, campaigns: [] }), {
  v: 1,
  ads: { 1: [{ name: 'A', at: 5 }] },
  campaigns: {},
});

// Two requests saving at once (a lead arriving while Reports loads): merged, neither loses names.
const a1 = emptyHistory();
noteName(a1, 'ads', '1', 'Video 1', T - 3 * DAY);
noteName(a1, 'ads', '1', 'Tim Facts', T - HOUR);
const b1 = emptyHistory();
noteName(b1, 'ads', '1', 'Video 1', T - 2 * DAY);
noteName(b1, 'ads', '2', 'Video 2', T - 2 * DAY);
noteName(b1, 'campaigns', '9', 'TGM First Campaign', T);
const merged = mergeHistory(a1, b1);
eq('merged: every name, each at its latest sighting', [merged.ads['1'], merged.ads['2'], merged.campaigns['9']], [
  [{ name: 'Video 1', at: T - 2 * DAY }, { name: 'Tim Facts', at: T - HOUR }],
  [{ name: 'Video 2', at: T - 2 * DAY }],
  [{ name: 'TGM First Campaign', at: T }],
]);
eq('merging changes neither', [a1.ads['2'], b1.ads['1'].length], [undefined, 1]);

const big = emptyHistory();
for (let i = 0; i < 12; i++) noteName(big, 'ads', '1', `Name ${i}`, T + i);
for (let i = 0; i < 3010; i++) noteName(big, 'ads', String(1000 + i), 'A', T - i * MIN);
const small = trimHistory(big);
eq('kept to size: 8 newest names an id', namesById(small, 'ads')['1'], ['Name 11', 'Name 10', 'Name 9', 'Name 8', 'Name 7', 'Name 6', 'Name 5', 'Name 4']);
eq('…and the 3000 ids seen most recently', [Object.keys(small.ads).length, !!small.ads['1'], !!small.ads['1000'], !!small.ads['3998'], !!small.ads['3999']], [3000, true, true, true, false]);

// ── Meta's names now, over the figures' own ──
const current = currentFromRows([
  { id: '101', name: 'Valley Vets Off Grid', campaign_id: '9', campaign: { name: 'TGM First Campaign', id: '9' }, adset_id: '7', adset: { name: 'South Wales 35+', id: '7' } },
  { id: '102', name: 'Martyn GoodWe Top 5', campaign_id: '9', campaign: { name: 'TGM First Campaign' }, adset_id: '7', adset: { name: 'South Wales 35+' } },
  { id: '', name: 'no id' },
  { id: '103' },
]);
eq('Meta’s ad list → names by ad id (no id or no name: left out)', current, {
  101: { name: 'Valley Vets Off Grid', campaignId: '9', campaignName: 'TGM First Campaign', adsetId: '7', adsetName: 'South Wales 35+' },
  102: { name: 'Martyn GoodWe Top 5', campaignId: '9', campaignName: 'TGM First Campaign', adsetId: '7', adsetName: 'South Wales 35+' },
});
const cached = [ad('101', 'Video 4', '9', 'First campaign', 168000, 79), ad('102', 'Video 1', '9', 'First campaign', 30000, 8), ad('199', 'Video 9', '9', 'First campaign', 500)];
eq('figures cached for an hour show today’s names; a campaign rename reaches an ad Meta’s list doesn’t have', withCurrentNames(cached, current).map((a) => [a.id, a.name, a.campaignName, a.spend]), [
  ['101', 'Valley Vets Off Grid', 'TGM First Campaign', 168000],
  ['102', 'Martyn GoodWe Top 5', 'TGM First Campaign', 30000],
  ['199', 'Video 9', 'TGM First Campaign', 500],
]);
eq('no names from Meta: the figures’ own', withCurrentNames(cached, null), cached);

// ── The owner’s case: five ads renamed, every older lead says "meta: Video N" with no ad id ──
const L = (source, o = {}) => ({ source, metaAdId: null, surveyed: false, won: false, lost: false, value: 0, ...o });
const NEW = { 1: 'Tim Facts', 2: 'Tim Newman Lawn', 3: 'Martyn GoodWe Top 5', 4: 'Valley Vets Off Grid', 5: 'Martyn Redwood' };
const SPEND = { 1: 21000, 2: 9000, 3: 15000, 4: 168000, 5: 6000 };
// What the CRM had cached before the rename: Meta's figures with "Video N" names.
const before = Object.keys(NEW).map((n) => ad(`60${n}`, `Video ${n}`, '900', 'TGM First Campaign', SPEND[n], n === '4' ? 39 : 4));
const seen = emptyHistory();
noteAds(seen, before, T - 2 * HOUR);
// Then Meta's list, with the new names.
const now = currentFromRows(Object.entries(NEW).map(([n, name]) => ({ id: `60${n}`, name, campaign_id: '900', campaign: { name: 'TGM First Campaign' } })));
noteAds(seen, withCurrentNames(before, now), T);
const owner = [
  ...Array.from({ length: 79 }, (_, i) => L('meta: Video 4', { surveyed: i < 12, won: i < 3, value: i < 3 ? 9000 : 0 })),
  ...Array.from({ length: 16 }, () => L('meta: Video 1')),
  ...Array.from({ length: 5 }, () => L('meta: Video 3')),
  L('meta: Video 5'),
  L('meta: Video 2'),
  L('meta: Tim Facts', { metaAdId: '601' }), // a lead since the rename
];
const ot = spendTable(owner, withCurrentNames(before, now), { spend: 219000, metaLeads: 55 }, pastNames(seen));
eq('one campaign, every ad under its new name, nothing left in "Other"', ot.groups.map((g) => [g.label, g.rows.map((r) => r.label)]), [
  ['TGM First Campaign', ['Valley Vets Off Grid', 'Tim Facts', 'Martyn GoodWe Top 5', 'Tim Newman Lawn', 'Martyn Redwood']],
]);
const vv = ot.groups[0].rows[0];
eq('Valley Vets Off Grid has the 79 "Video 4" leads and its own spend, with "was Video 4"', [vv.leads, vv.surveys, vv.won, vv.value, vv.spend, vv.metaLeads, vv.note], [79, 12, 3, 27000, 168000, 39, 'was Video 4']);
const tf = ot.groups[0].rows.find((r) => r.label === 'Tim Facts');
eq('a lead since the rename (with its ad id) and older ones by the old name share the row', [tf.leads, tf.spend, tf.note], [17, 21000, 'was Video 1']);
eq('every penny in exactly one row', [ot.total.spend, ot.groups.reduce((n, g) => n + g.total.spend, 0), ot.total.leads], [219000, 219000, 103]);

// Before this change: no history, so the old name had nowhere to go.
const blind = spendTable(owner, withCurrentNames(before, now), null);
yes('(without the names seen, "Video 4" leads were split from the spend)', blind.groups.some((g) => g.rows.some((r) => r.label === 'Video 4' && !r.spend)));

// A campaign renamed too: the new name, the old one beneath.
const renamedCampaign = spendTable([L('meta: Video 4')], [ad('604', 'Valley Vets Off Grid', '900', 'Off grid – autumn', 1000)], null, { ads: { 604: ['Video 4'] }, campaigns: { 900: ['Off grid – autumn', 'TGM First Campaign'] } });
eq('a renamed campaign: its name now, "was …" beneath', [renamedCampaign.groups[0].label, renamedCampaign.groups[0].total.note], ['Off grid – autumn', 'was TGM First Campaign']);
eq('a campaign never renamed has no note', ot.groups[0].total.note, undefined);

// ── Names several ads have had ──
// Both "Video 4"s (two ad sets) renamed the same: one row, as before, under the new name.
const twin = spendTable(
  [L('meta: Video 4'), L('meta: Video 4', { won: true, value: 5000 })],
  [ad('604', 'Valley Vets Off Grid', '900', 'TGM', 120000, 30), ad('704', 'Valley Vets Off Grid', '900', 'TGM', 48000, 9)],
  null,
  { ads: { 604: ['Valley Vets Off Grid', 'Video 4'], 704: ['Valley Vets Off Grid', 'Video 4'] } }
);
eq('two ads renamed alike share a row: new name, "was Video 4 · 2 ads with this name"', twin.groups[0].rows.map((r) => [r.label, r.leads, r.spend, r.note]), [
  ['Valley Vets Off Grid', 2, 168000, 'was Video 4 · 2 ads with this name'],
]);
// One renamed, the other still "Video 4": the leads can't say which, so both ads, named.
const split = [ad('604', 'Valley Vets Off Grid', '900', 'TGM', 120000), ad('704', 'Video 4', '900', 'TGM', 48000), ad('601', 'Tim Facts', '900', 'TGM', 21000)];
const splitPast = { ads: { 604: ['Valley Vets Off Grid', 'Video 4'], 704: ['Video 4'], 601: ['Tim Facts', 'Video 1'] } };
const sp = spendTable([L('meta: Video 4'), L('meta: Video 4'), L('meta: Video 1')], split, null, splitPast);
eq('one renamed, one not: one row with both names, saying why', sp.groups[0].rows.map((r) => [r.label, r.leads, r.spend, r.note]), [
  ['Valley Vets Off Grid + Video 4', 2, 168000, '2 ads have been called “Video 4”'],
  ['Tim Facts', 1, 21000, 'was Video 1'],
]);
// Once Meta's Lead API gives some of those leads their ad: those go with it, each ad keeps its own
// spend, and the one Meta couldn't place (over 90 days old) isn't guessed onto either.
const sp2 = spendTable([L('meta: Video 4', { metaAdId: '604' }), L('meta: Video 4', { metaAdId: '604' }), L('meta: Video 4')], split, null, splitPast);
eq('leads with their ad id keep it; one that can’t be told apart gets its own row, no spend', sp2.groups[0].rows.map((r) => [r.label, r.leads, r.spend, r.note]), [
  ['Valley Vets Off Grid', 2, 120000, 'was Video 4'],
  ['Valley Vets Off Grid + Video 4', 1, null, 'Leads that don’t say which ad: 2 ads have been called “Video 4”'],
  ['Video 4', 0, 48000, undefined],
  ['Tim Facts', 0, 21000, 'was Video 1'],
]);
eq('…and still every penny once', [sp2.total.spend, sp2.total.leads], [189000, 3]);
// Renamed twice: leads under either old name find it.
const twice = spendTable([L('meta: Video 4'), L('meta: Video 4b')], [ad('604', 'Valley Vets Off Grid', '900', 'TGM', 1000)], null, { ads: { 604: ['Valley Vets Off Grid', 'Video 4b', 'Video 4'] } });
eq('renamed twice: both old names go with it; "was" shows the last two', twice.groups[0].rows.map((r) => [r.label, r.leads, r.note]), [['Valley Vets Off Grid', 2, 'was Video 4b, Video 4']]);
// A name used again for a new ad: new leads have its id; an older one with just the name can only
// be the renamed one's, as the new ad was made after it came in (Meta's created_time).
const AT = (daysAgo) => new Date(T - daysAgo * DAY).toISOString();
const reusedAds = [{ ...ad('604', 'Valley Vets Off Grid', '900', 'TGM', 1000), createdAt: AT(200) }, { ...ad('804', 'Video 4', '900', 'TGM', 400), createdAt: AT(10) }];
const reusedLeads = [L('meta: Video 4', { metaAdId: '804', at: AT(2) }), L('meta: Video 4', { metaAdId: '804', at: AT(1) }), L('meta: Video 4', { at: AT(60) })];
const reused = spendTable(reusedLeads, reusedAds, null, { ads: { 604: ['Valley Vets Off Grid', 'Video 4'] } });
eq('a reused name: the new ad keeps its leads, an older name-only one goes with the ad that had the name then', reused.groups[0].rows.map((r) => [r.label, r.leads, r.spend]), [
  ['Video 4', 2, 400],
  ['Valley Vets Off Grid', 1, 1000],
]);
const recent = spendTable([...reusedLeads.slice(0, 2), L('meta: Video 4', { at: AT(3) })], reusedAds, null, { ads: { 604: ['Valley Vets Off Grid', 'Video 4'] } });
eq('…a name-only one from after the new ad was made could be either: not guessed', recent.groups[0].rows.map((r) => [r.label, r.leads, r.spend]), [
  ['Video 4', 2, 400],
  ['Valley Vets Off Grid + Video 4', 1, null],
  ['Valley Vets Off Grid', 0, 1000],
]);
eq('no dates known: as if made before', spendTable([L('meta: Video 4')], [ad('604', 'Valley Vets', '9', 'C', 1), { ...ad('804', 'Video 4', '9', 'C', 1), createdAt: AT(1) }], null, { ads: { 604: ['Video 4'] } }).groups[0].rows[0].label, 'Valley Vets + Video 4');
eq('every ad made after the lead (odd clocks): all of them still fit', spendTable([L('meta: Video 4', { at: AT(30) })], [{ ...ad('804', 'Video 4', '9', 'C', 1), createdAt: AT(1) }], null).groups[0].rows[0].leads, 1);
eq('an ad’s made date comes from Meta’s list', [currentFromRows([{ id: '1', name: 'A', created_time: '2026-03-04T10:00:00+0000' }])[1].createdAt, withCurrentNames([ad('1', 'x', '9', 'C', 0)], { 1: { name: 'A', campaignId: '9', campaignName: 'C', adsetId: '', adsetName: '', createdAt: '2026-03-04T10:00:00.000Z' } })[0].createdAt], ['2026-03-04T10:00:00.000Z', '2026-03-04T10:00:00.000Z']);
// Two shared names over the same ads join one row, so no ad's spend is counted twice.
const chain = [ad('1', 'Alpha', '9', 'C', 100), ad('2', 'Beta', '9', 'C', 200), ad('3', 'Gamma', '9', 'C', 300)];
const ct = spendTable([L('meta: X'), L('meta: Y')], chain, { spend: 600, metaLeads: 0 }, { ads: { 1: ['Alpha', 'X', 'Y'], 2: ['Beta', 'X'], 3: ['Gamma', 'Y'] } });
eq('overlapping shared names become one row; spend counted once', [ct.groups[0].rows.map((r) => [r.label, r.leads, r.spend]), ct.total.spend], [[['Gamma + Beta + Alpha', 2, 600]], 600]);
const four = spendTable([L('meta: X')], [...chain, ad('4', 'Delta', '9', 'C', 50)], null, { ads: { 1: ['X'], 2: ['X'], 3: ['X'], 4: ['X'] } });
eq('more than three names: the two that spent most, then how many more', four.groups[0].rows[0].label, 'Gamma + Beta + 2 more');
// Shared ads in several campaigns still go to "Other", as before.
const across = spendTable([L('meta: Video 4')], [ad('604', 'Valley Vets', '900', 'TGM', 1000), ad('704', 'Valley Vets', '901', 'TGM – Copy', 500)], null, { ads: { 604: ['Video 4'], 704: ['Video 4'] } });
eq('renamed ads sharing an old name across campaigns: in "Other", saying where', [across.groups.map((g) => g.label), across.groups[0].rows[0].note], [
  ['Other Meta leads and spend'],
  'was Video 4 · 2 ads with this name, in “TGM” and “TGM – Copy”',
]);

// No history at all: a lead with its ad id and its old name teaches the table.
const taught = spendTable([L('meta: Video 4', { metaAdId: '604' }), L('meta: Video 4')], [ad('604', 'Valley Vets Off Grid', '900', 'TGM', 1000)], null);
eq('a lead with an ad id and an old name: name-only leads with that name follow it', taught.groups[0].rows.map((r) => [r.label, r.leads, r.note]), [['Valley Vets Off Grid', 2, 'was Video 4']]);
// Website links name the campaign and ad as they were when clicked.
const web = spendTable([L('meta-ad: TGM First Campaign / Video 4')], [ad('604', 'Valley Vets Off Grid', '900', 'Off grid – autumn', 1000)], null, {
  ads: { 604: ['Video 4'] },
  campaigns: { 900: ['TGM First Campaign'] },
});
eq('a website ad link with old campaign and ad names finds the ad', [web.groups[0].label, web.groups[0].rows[0].label, web.groups[0].rows[0].leads], ['Off grid – autumn', 'Valley Vets Off Grid', 1]);
// History for ads not in the period changes nothing.
eq('names of ads not in the figures are ignored', spendTable([L('meta: Video 4')], [ad('1', 'A', '9', 'C', 100)], null, { ads: { 604: ['Video 4'] } }).groups.map((g) => g.label), ['C', 'Other Meta leads and spend']);

// ── For other pages: a lead's ad's name now ──
const look = nameLookup(now, seen);
eq('by ad id', leadAdName(look, 'meta: Video 4', '604'), 'Valley Vets Off Grid');
eq('by the name it came in with', [leadAdName(look, 'meta: Video 4'), leadAdName(look, 'Meta:  video 1 ')], ['Valley Vets Off Grid', 'Tim Facts']);
eq('its own name now, an unknown name, another source → null (use the lead’s own)', [leadAdName(look, 'meta: Valley Vets Off Grid'), leadAdName(look, 'meta: Gone'), leadAdName(look, 'cms-form')], [null, null, null]);
const both = emptyHistory();
noteName(both, 'ads', '604', 'Video 4', T - DAY);
noteName(both, 'ads', '704', 'Video 4', T - DAY);
const amb = nameLookup({ 604: { name: 'Valley Vets Off Grid', campaignId: '9', campaignName: 'C', adsetId: '', adsetName: '' }, 704: { name: 'Video 4', campaignId: '9', campaignName: 'C', adsetId: '', adsetName: '' } }, both);
eq('an old name two ads have had, now named differently: not guessed', [leadAdName(amb, 'meta: Video 4'), amb.renamed], [null, {}]);
eq('without Meta’s list: the newest name seen', nameLookup(null, seen).ads['604'], 'Valley Vets Off Grid');
eq('campaigns by id', look.campaigns['900'], 'TGM First Campaign');

// ── Which older leads to ask Meta for their ad ──
const row = (id, o = {}) => ({ id: `e${id}`, source: 'meta: Video 4', meta_lead_id: `55${id}`, meta_ad_id: null, created_at: new Date(T - id * DAY).toISOString(), ...o });
const rows = [
  row(5),
  row(1),
  row(2, { meta_ad_id: '604' }), // has its ad
  row(3, { source: 'meta-organic' }), // not from an ad
  row(4, { source: 'whatsapp-ad' }),
  row(6, { source: 'meta-lead-ad' }), // a form lead without an ad name
  row(7, { meta_lead_id: null }),
  row(8, { meta_lead_id: '55abc' }), // not a Meta lead id
  row(9), // Meta couldn't give it last week
  row(10), // …or 31 days ago: ask again
  row(1, { id: 'dup' }), // the same Meta lead twice
  row(11, { created_at: null }),
];
const misses = readMisses({ v: 1, ids: { 559: T - 7 * DAY, 5510: T - 31 * DAY } }, T);
eq('misses over 30 days old are forgotten', misses, { v: 1, ids: { 559: T - 7 * DAY } });
eq('lead-form leads without an ad id, not missed lately, newest first, once each', leadsToBackfill(rows, misses, T, 50).map((r) => r.id), ['e1', 'e5', 'e6', 'e10', 'e11']);
eq('at most `limit`', leadsToBackfill(rows, misses, T, 2).map((r) => r.id), ['e1', 'e5']);
// Before ad-spend.sql (no meta_ad_id to read): only the names are kept, and leads whose names are kept already are skipped like misses.
const noAdColumn = rows.filter((r) => !r.meta_ad_id).map((r) => ({ ...r, meta_ad_id: undefined }));
eq('before ad-spend.sql: names kept already skipped, like misses', leadsToBackfill(noAdColumn, { v: 1, ids: { ...misses.ids, 551: T - DAY } }, T, 50).map((r) => r.id), ['e5', 'e6', 'e10', 'e11']);
eq('misses: nonsense left out, newest kept when there are too many', [
  readMisses({ v: 1, ids: { abc: T, 1: 'x', 2: T } }, T),
  Object.keys(readMisses({ v: 1, ids: Object.fromEntries(Array.from({ length: 5003 }, (_, i) => [String(i + 1), T - i])) }, T).ids).length,
  readMisses(null, T),
], [{ v: 1, ids: { 2: T } }, 5000, { v: 1, ids: {} }]);

// ── What Meta's batch answers mean ──
const ok = (body) => ({ code: 200, body: JSON.stringify(body) });
const fail = (code, message, subcode) => ({ code: 400, body: JSON.stringify({ error: { message, code, error_subcode: subcode } }) });
const NOPE = "Unsupported get request. Object with ID '55' does not exist, cannot be loaded due to missing permissions, or does not support this operation";
const young = [row(1), row(2), row(3), row(4), row(5)];
const b = readLeadBatch(young, [ok({ id: '551', ad_id: '604', adset_id: '7', campaign_id: '900', ad_name: 'Valley Vets Off Grid' }), ok({ id: '552', is_organic: true }), fail(100, NOPE, 33), null, fail(17, 'User request limit reached')], T);
eq('found, no ad (organic), gone (the key works), timed out, rate-limited', [b.found.map((f) => [f.row.id, f.lead.ad_id]), b.missed, b.errors.map((e) => e.code)], [[['e1', '604']], ['552', '553'], [17]]);
const allFail = readLeadBatch([row(1), row(100)], [fail(100, NOPE, 33), fail(100, NOPE, 33)], T);
eq('every lead "does not exist": a recent one may be the key, so only the 100-day-old one is remembered', [allFail.found.length, allFail.missed, allFail.errors.length], [0, ['55100'], 1]);
const fields = readLeadBatch([row(1)], [fail(100, '(#100) Tried accessing nonexisting field (ad_id)')], T);
eq('a field Meta won’t give isn’t taken as the lead being gone', [fields.missed, fields.errors.length], [[], 1]);
eq('not a list → an error, nothing remembered', [readLeadBatch([row(1)], { error: 'x' }, T).errors.length, readLeadBatch([row(1)], { error: 'x' }, T).missed], [1, []]);
eq('an answer that isn’t JSON', readLeadBatch([row(1)], [{ code: 200, body: '<html>' }], T).errors.length, 1);
eq('an ad id that isn’t a number counts as no ad', readLeadBatch([row(1)], [ok({ ad_id: 'x' })], T).missed, ['551']);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
