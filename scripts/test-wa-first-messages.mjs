// The first WhatsApp to a new Meta lead, by the ad (video) they came from
// (src/lib/whatsapp/first-messages-shared.ts): settings cleaned and kept in range, a lead matched to its
// ad's choice by Meta's id or any name the ad has had (so a rename in Ads Manager doesn't lose it),
// changing an ad's choice replacing the one made under its old name, and the delay in words.
// Usage: node --experimental-strip-types scripts/test-wa-first-messages.mjs
const { adMessageFor, choicesFor, cleanFirst, DEFAULT_FIRST, delayWords, withAdMessage } = await import('../src/lib/whatsapp/first-messages-shared.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// ── Settings ──
eq('nothing saved: off, 8–13 minutes, no ads', cleanFirst({}), { auto: false, minMinutes: 8, maxMinutes: 13, byAd: [] });
eq('the defaults are those', DEFAULT_FIRST, cleanFirst(null));
eq('only true switches it on', [cleanFirst({ auto: 'yes' }).auto, cleanFirst({ auto: 1 }).auto, cleanFirst({ auto: true }).auto], [false, false, true]);
eq('minutes kept in range and whole', cleanFirst({ minMinutes: -4, maxMinutes: 500.6 }), { auto: false, minMinutes: 0, maxMinutes: 120, byAd: [] });
eq('the later time never before the earlier', [cleanFirst({ minMinutes: 20, maxMinutes: 5 }).maxMinutes, cleanFirst({ minMinutes: 20 }).maxMinutes], [20, 20]);
eq('junk minutes: the defaults', [cleanFirst({ minMinutes: 'soon' }).minMinutes, cleanFirst({ maxMinutes: null }).maxMinutes], [8, 13]);
eq(
  'ads: names tidied, ids only Meta’s digits, no template or name dropped, one per name',
  cleanFirst({
    byAd: [
      { name: '  Video   4 ', ids: ['123', 123, 'abc', '123', '__proto__'], template: 'intro_video_4' },
      { name: 'video 4', ids: [], template: 'other' },
      { name: '', template: 'x' },
      { name: 'No template', template: '' },
      { name: 'Bad template', template: 'Has Spaces' },
      'nonsense',
      null,
    ],
  }).byAd,
  [{ name: 'Video 4', ids: ['123'], template: 'intro_video_4' }]
);

// ── Which template a lead gets ──
const byAd = [
  { name: 'Valley Vets Off Grid', ids: ['111', '222'], template: 'intro_valley_vets' },
  { name: 'Video 7', ids: [], template: 'intro_video_7' },
];
const pick = (ad) => adMessageFor(byAd, ad)?.template ?? null;
eq('by Meta’s id', pick({ id: '222', names: ['Something else'] }), 'intro_valley_vets');
eq('by its name when they came in', pick({ id: null, names: ['Video 7'] }), 'intro_video_7');
eq('by its name now (any capitals and spacing)', pick({ names: [null, '  valley  vets off grid'] }), 'intro_valley_vets');
eq('an id wins over a name', pick({ id: '111', names: ['Video 7'] }), 'intro_valley_vets');
eq('an id we don’t know falls back to the name', pick({ id: '999', names: ['Video 7'] }), 'intro_video_7');
eq('an ad with no choice: the general first message', pick({ id: '999', names: ['Video 2'] }), null);
eq('a lead with no ad', pick({ names: [] }), null);
eq('ids compare as text', pick({ id: 111, names: [] }), 'intro_valley_vets');

// ── Changing an ad's choice ──
const row = { name: 'Valley Vets Off Grid', was: ['Video 4'], ids: ['111', '333'] };
eq('its choices: by id or by any name it has had', choicesFor([...byAd, { name: 'Video 4', ids: [], template: 'old' }], row).map((m) => m.template), ['intro_valley_vets', 'old']);
eq(
  'set: replaces the one under its old name, keeps every id',
  withAdMessage([...byAd, { name: 'Video 4', ids: ['444'], template: 'old' }], row, 'intro_new'),
  [
    { name: 'Video 7', ids: [], template: 'intro_video_7' },
    { name: 'Valley Vets Off Grid', ids: ['111', '333', '222', '444'], template: 'intro_new' },
  ]
);
eq('set to none: back to the general first message', withAdMessage(byAd, row, ''), [{ name: 'Video 7', ids: [], template: 'intro_video_7' }]);
eq('a new ad', withAdMessage([], { name: ' Tim  Facts ', ids: ['555', 'x'] }, 'intro_tim'), [{ name: 'Tim Facts', ids: ['555'], template: 'intro_tim' }]);

// ── In words ──
eq('delayWords', [delayWords({ minMinutes: 8, maxMinutes: 13 }), delayWords({ minMinutes: 10, maxMinutes: 10 }), delayWords({ minMinutes: 1, maxMinutes: 1 }), delayWords({ minMinutes: 0, maxMinutes: 0 })], [
  '8–13 minutes',
  '10 minutes',
  '1 minute',
  'straight away',
]);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
