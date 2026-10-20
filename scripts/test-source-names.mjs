// A lead's source with its Meta ad's name now (src/lib/lead-source.ts sourceNow, src/lib/ad-names.ts
// adNameNow): leads keep the name their ad had when they came in ("meta: Video 1"), and every page
// that shows a source shows the ad's name now ("Meta ad · Tim Facts", "was Video 1"). By the lead's
// ad id, else by the names the CRM has seen; two ads that shared an old name and are now named
// differently show both names, not a guess.
// Usage: node --experimental-strip-types scripts/test-source-names.mjs
import { registerHooks } from 'node:module';

// lead-source.ts imports './ad-spend' and './ad-names' without the .ts on the end (as the app's bundler expects); Node needs it.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const { adNameNow, emptyHistory, nameLookup, noteName, readHistory } = await import('../src/lib/ad-names.ts');
const { isAdLead, leadSourceLabel, metaAdLabel, sourceNow } = await import('../src/lib/lead-source.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const T = Date.parse('2026-10-20T12:00:00Z');
const DAY = 86_400_000;
const ad = (name) => ({ name, campaignId: '900', campaignName: 'TGM First Campaign', adsetId: '', adsetName: '' });

// The owner's ads: Video 1 to 5 renamed in Ads Manager; two ads were called Video 4.
const seen = emptyHistory();
for (const [id, name] of [
  ['601', 'Video 1'],
  ['602', 'Video 2'],
  ['603', 'Video 3'],
  ['604', 'Video 4'],
  ['704', 'Video 4'],
  ['605', 'Video 5'],
])
  noteName(seen, 'ads', id, name, T - 10 * DAY);
const now = {
  601: ad('Tim Facts'),
  602: ad('Tim Newman Lawn'),
  603: ad('Martyn GoodWe Top 5'),
  604: ad('Valley Vets Off Grid'),
  704: ad('Video 4'),
  605: ad('Martyn Redwood'),
};
const names = nameLookup(now, seen);
const show = (source, id) => sourceNow(source, id, names);

// ── Renamed ──
eq('by its ad id', show('meta: Video 1', '601'), { label: 'Meta ad · Tim Facts', ad: 'Tim Facts', note: 'was Video 1' });
eq('by the names seen (no ad id)', show('meta: Video 1', null), { label: 'Meta ad · Tim Facts', ad: 'Tim Facts', note: 'was Video 1' });
eq('...any case and spaces', show('  Meta:   video 1 ', undefined), { label: 'Meta ad · Tim Facts', ad: 'Tim Facts', note: 'was video 1' });
eq(
  'every renamed ad',
  ['meta: Video 2', 'meta: Video 3', 'meta: Video 5'].map((s) => show(s).label),
  ['Meta ad · Tim Newman Lawn', 'Meta ad · Martyn GoodWe Top 5', 'Meta ad · Martyn Redwood']
);
eq('a lead that came in under the new name: no note', show('meta: Tim Facts', '601'), { label: 'Meta ad · Tim Facts', ad: 'Tim Facts', note: null });
eq('...nor without its id', show('meta: Tim Facts'), { label: 'Meta ad · Tim Facts', ad: 'Tim Facts', note: null });
eq('an ad id the CRM doesn’t know: by the name', show('meta: Video 2', '999'), { label: 'Meta ad · Tim Newman Lawn', ad: 'Tim Newman Lawn', note: 'was Video 2' });

// ── The two "Video 4" ads (one renamed, one not) ──
eq('its ad id says which', show('meta: Video 4', '604'), { label: 'Meta ad · Valley Vets Off Grid', ad: 'Valley Vets Off Grid', note: 'was Video 4' });
eq('...the other one', show('meta: Video 4', '704'), { label: 'Meta ad · Video 4', ad: 'Video 4', note: null });
eq('no ad id: both names, not a guess', show('meta: Video 4'), {
  label: 'Meta ad · Valley Vets Off Grid / Video 4',
  ad: 'Valley Vets Off Grid / Video 4',
  note: 'was Video 4 · 2 ads have had this name',
});
// Both renamed the same: no doubt which name.
const same = nameLookup({ ...now, 704: ad('Valley Vets Off Grid') }, seen);
eq('both renamed to the same name: that name', sourceNow('meta: Video 4', null, same), { label: 'Meta ad · Valley Vets Off Grid', ad: 'Valley Vets Off Grid', note: 'was Video 4' });
// Both renamed, differently: both new names, A to Z.
const apart = nameLookup({ ...now, 704: ad('Off Grid Autumn') }, seen);
eq('both renamed differently: both new names', sourceNow('meta: Video 4', null, apart).label, 'Meta ad · Off Grid Autumn / Valley Vets Off Grid');
eq('the lookup keeps them apart', [same.renamed['video 4'], apart.shared['video 4']], ['Valley Vets Off Grid', ['Valley Vets Off Grid', 'Off Grid Autumn']]);
// Capitals alone don't make two names.
const caps = nameLookup({ ...now, 704: ad('valley vets off grid') }, seen);
eq('names that differ only in capitals are one', sourceNow('meta: Video 4', null, caps).label, 'Meta ad · Valley Vets Off Grid');

// ── Nothing to go on ──
eq('an old name the CRM has never seen: as it came in', show('meta: Battery promo'), { label: 'Meta ad · Battery promo', ad: 'Battery promo', note: null });
eq('no names kept yet: as it came in', sourceNow('meta: Video 1', '601', null), { label: 'Meta ad · Video 1', ad: 'Video 1', note: null });
eq('an empty lookup: as it came in', sourceNow('meta: Video 1', null, nameLookup(null, emptyHistory())), { label: 'Meta ad · Video 1', ad: 'Video 1', note: null });
eq('cms_kv’s copy unreadable: as it came in', sourceNow('meta: Video 1', null, nameLookup(null, readHistory('garbage'))).label, 'Meta ad · Video 1');
// Without Meta's list (ad spend not set up, or Meta not asked yet): the newest name seen on each ad.
const history = emptyHistory();
noteName(history, 'ads', '601', 'Video 1', T - 10 * DAY);
noteName(history, 'ads', '601', 'Tim Facts', T - DAY);
eq('only the names seen: the newest', sourceNow('meta: Video 1', null, nameLookup(null, history)), { label: 'Meta ad · Tim Facts', ad: 'Tim Facts', note: 'was Video 1' });

// ── Meta leads without an ad name ──
eq('organic', show('meta-organic', '601'), { label: 'Meta (organic)', ad: 'Organic', note: null });
eq('a form Meta didn’t name, with its ad id', show('meta-lead-ad', '601'), { label: 'Meta ad · Tim Facts', ad: 'Tim Facts', note: null });
eq('...without one', show('meta-lead-ad', null), { label: 'Meta ad', ad: 'Ad not known', note: null });
eq('a WhatsApp ad chat with its ad id', show('whatsapp-ad', '602'), { label: 'Meta ad (WhatsApp) · Tim Newman Lawn', ad: 'WhatsApp ad · Tim Newman Lawn', note: null });
eq('...without one', show('whatsapp-ad', null), { label: 'Meta ad (WhatsApp)', ad: 'WhatsApp ad', note: null });
eq('a website ad link keeps its words', show('meta-ad: TGM First Campaign / Video 4'), {
  label: 'Meta ad (website) · TGM First Campaign / Video 4',
  ad: 'Website · TGM First Campaign / Video 4',
  note: null,
});

// ── Everything else: as before ──
for (const s of ['website', 'quote-form', 'cms-form', 'website-booking', 'google-ads: Brand', 'whatsapp', 'whatsapp-import', 'crm', 'newsletter: October', '', null]) {
  eq(`not Meta: ${JSON.stringify(s)}`, show(s, '601'), { label: leadSourceLabel(s), ad: metaAdLabel(s), note: null });
}
eq('which leads can have an ad’s name', ['meta: Video 1', 'meta-lead-ad', 'whatsapp-ad', 'meta-organic', 'meta-ad: X', 'website', null].map(isAdLead), [true, true, true, false, false, false, false]);

// ── adNameNow on its own ──
eq('nothing to go on', [adNameNow(names, null, null), adNameNow(names, '', '999')], [null, null]);
eq('an id with no name to compare', adNameNow(names, null, '603'), { name: 'Martyn GoodWe Top 5', note: null });
eq('ids are looked up as their own keys only', adNameNow(names, 'Video 1', '__proto__'), { name: 'Tim Facts', note: 'was Video 1' });

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
