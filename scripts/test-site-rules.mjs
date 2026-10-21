// The site forms and their rules (src/lib/site/rules.ts with forms/roofer.ts and forms/scaffold.ts):
// what's asked, the gate, the flags (FORMS 5.1, 5.2), late keys, and the SPEC 1H acceptance list.
// Usage: node --experimental-strip-types scripts/test-site-rules.mjs
import { registerHooks } from 'node:module';

// The site modules import their neighbours without ".ts", as the bundler expects.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const R = await import('../src/lib/site/rules.ts');
const F = await import('../src/lib/site/forms/index.ts');
const { ROOFER } = await import('../src/lib/site/forms/roofer.ts');
const { SCAFFOLD_UP, SCAFFOLD_DOWN } = await import('../src/lib/site/forms/scaffold.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const design = {
  strings_design: [8, 8],
  optimisers: false,
  optimiser_model: null,
  mounting: 'on_roof',
  roof_faces: null,
  est_kwh_year: null,
  shade_factor: null,
  bird_mesh: null,
  battery_backup: null,
  eess_class: null,
  battery_kw: null,
  pas63100: null,
  maintenance_plan: null,
  ozev_grant: null,
  bs7671_edition: null,
};
const system = { kwp: 7.2, panel_count: 16, panel_model: 'Aiko Neostar 2P 450W', inverter_model: null, battery_model: null };
const wrap = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v, src: 'typed' }]));
const ctx = (vals, photos = {}, extra = {}) =>
  R.makeCtx({ trade: 'roofer', answers: wrap(vals), design, system, products: ['solar'], sides: ['front', 'rear'], photos, reads: [], address: '12 High Street, Newport, NP20 4AB', signed: [], ...extra });
const keysOf = (form, c) => R.allVisible(form, c).map(({ f }) => f.key);

/* ── The roofer: a complete, clean job signs ───────────────────────────────── */
const photosDone = { RF1: 2, RF12: 1, RF2: 2, RX4p: 1, RF3: 3 };
const clean = {
  RF5: 'no',
  RF13: 'Aiko Neostar 2P 450W',
  RF14: 49.6,
  RX1: 'yes',
  RF10: 2,
  RF11: [8, 8],
  RX5: 16,
  RF6: 'yes',
  RF7: 'no',
  RF8: 'yes',
  RF9: true,
  RX4: 'yes',
  RF4: 'no',
  RX2: 'yes',
  RX3: 'no',
  RX6: 'no',
  RX8: 'yes',
  RX9: 'no',
};
let c = ctx(clean, photosDone);
let s = R.signCheck(ROOFER, c);
eq('a complete roofer form can be signed, with no flags', [s.ok, s.flags.length, s.must.length, s.should.length], [true, 0, 0, 0]);
eq('progress: every step done', R.formProgress(ROOFER, c).done === R.formProgress(ROOFER, c).total, true);
eq('the job screen line', R.summaryLine(ROOFER, ctx({})), '18 questions, 9 photos, about 10 minutes');

/* ── An empty form: the gate lists every must, photos with their counts ───── */
s = R.signCheck(ROOFER, ctx({}, { RF1: 1 }));
eq('empty: not signable', s.ok, false);
eq('empty: photos below the minimum say how many', s.must.find((m) => m.key === 'RF1')?.why, '1 of 2 photos');
eq('empty: RF3 needs 3', s.must.find((m) => m.key === 'RF3')?.why, '0 of 3 photos');
eq('should items never block: listed as Not filled', s.should.map((m) => m.key), ['RX3', 'RX6', 'RX8']);

/* ── SPEC 1H acceptance ────────────────────────────────────────────────────── */
c = ctx({ ...clean, RF7: 'no' }, photosDone);
eq('RF7 = No hides RF7a and RF7b', ['RF7a', 'RF7b'].some((k) => keysOf(ROOFER, c).includes(k)), false);
c = ctx({ ...clean, RF7: 'yes', RF7a: 'no' }, photosDone);
eq('RF7 = Yes and RF7a = No: Urgent, before sign-off', R.flagsFor(ROOFER, c).filter((f) => f.code === 'RF7a').map((f) => f.severity), ['urgent']);
eq('…and optimisers against a design with none: Urgent too', R.flagsFor(ROOFER, c).some((f) => f.code === 'RF7' && f.severity === 'urgent'), true);
c = ctx({ ...clean, RF7: 'yes', RF7a: 'yes' }, photosDone);
eq('RF7a = Yes needs an RF7b photo', R.missing(ROOFER, c).must.map((m) => m.key), ['RF7b']);
eq('…and one photo is enough', R.missing(ROOFER, ctx({ ...clean, RF7: 'yes', RF7a: 'yes' }, { ...photosDone, RF7b: 1 })).must.length, 0);
c = ctx({ ...clean, RF10: 3, RF11: [6, 6, 5] }, photosDone);
const rf11 = ROOFER.steps.flatMap((x) => x.fields).find((f) => f.key === 'RF11');
eq('RF10 = 3 shows three boxes', R.stringsOf(rf11, c), 3);
eq('the strings add up to 17, not the 16 fitted: Review', R.flagsFor(ROOFER, c).find((f) => f.code === 'RF11')?.text, 'Panels per string add up to 17, but 16 fitted; the design has 16');
eq('…listed on the sign screen but signable', R.signCheck(ROOFER, c).ok, true);
c = ctx({ ...clean, RF8: 'no' }, photosDone);
s = R.signCheck(ROOFER, c);
eq('RF8 = No with no explanation: Stop, not signable', [s.ok, s.stops.map((f) => f.code)], [false, ['RF8']]);
c = ctx({ ...clean, RF8: 'no', RF8n: 'Clips ran out, back tomorrow' }, photosDone);
s = R.signCheck(ROOFER, c);
eq('…with an explanation: signs with an Urgent flag', [s.ok, s.flags.map((f) => `${f.code}:${f.severity}`)], [true, ['RF8:urgent']]);
c = ctx({ ...clean, RF9: 'cant' }, photosDone);
eq('RF9 "I can’t confirm this" with no reason: Stop', R.signCheck(ROOFER, c).stops.map((f) => f.code), ['RF9']);

/* ── Follow-ups: flipping back keeps the draft, the record leaves it out ───── */
c = ctx({ ...clean, RF4: 'no', RF4n: 'Cracked ridge tile' }, photosDone);
eq('a hidden follow-up is not on the record', Object.keys(R.recordAnswers(ROOFER, c)).includes('RF4n'), false);
eq('…and raises nothing', R.flagsFor(ROOFER, c).length, 0);
c = ctx({ ...clean, RF4: 'yes', RF4n: 'Cracked ridge tile' }, { ...photosDone, RF4p: 1 });
eq('flipped back: on the record, and the Review flag with its words', [Object.keys(R.recordAnswers(ROOFER, c)).includes('RF4n'), R.flagsFor(ROOFER, c)[0]?.text], [true, 'Issues found on the roof: Cracked ridge tile']);

/* ── Suggestions are offered, never filled in ──────────────────────────────── */
const f = (k) => ROOFER.steps.flatMap((x) => x.fields).find((x) => x.key === k);
c = ctx({});
eq('RF10 offered from the design', f('RF10').suggest(c), { v: 2, src: 'design', text: '2' });
eq('RF13 offered from the design', f('RF13').suggest(c).src, 'design');
const read = { key: 'RF12', status: 'read', result: { readable: true, problem: null, kind: 'panel', make: 'Aiko', model: 'AIKO-A450-MAH54Mw', serials: [], panel: { pmax_w: 450, voc_v: 39.8, isc_a: null, vmp_v: null, imp_a: null, max_system_v: null }, battery: null, inverter: null, meter: null } };
c = ctx({}, {}, { reads: [read] });
eq('RF13 offered from the photo once read', f('RF13').suggest(c), { v: 'AIKO-A450-MAH54Mw', src: 'photo', text: 'AIKO-A450-MAH54Mw' });
eq('RF14 offered from the photo', f('RF14').suggest(c), { v: 39.8, src: 'photo', text: '39.8 V' });
eq('nothing is in the answers until it’s taken', c.values.RF13, undefined);
c = ctx({ ...clean, RF13: 'AIKO-A450-MAH54Mw', RF14: 41 }, photosDone, { reads: [read] });
eq('model not the design’s, Voc not the label’s: two Review flags', R.flagsFor(ROOFER, c).map((x) => x.code), ['RF13', 'RF14']);

/* ── Flags keep when they were raised and how they were resolved ───────────── */
const was = [{ code: 'RF6', severity: 'urgent', key: 'RF6', text: 'old', at: '2026-11-03T09:00:00Z', resolved_at: '2026-11-03T10:00:00Z', resolved_by: 'Callum', note: 'Rewired' }];
const merged = R.mergeFlags(was, [{ code: 'RF6', severity: 'urgent', key: 'RF6', text: 'new' }], '2026-11-03T11:00:00Z');
eq('merge keeps raised-at and the resolution', [merged[0].at, merged[0].note, merged[0].text], ['2026-11-03T09:00:00Z', 'Rewired', 'new']);
eq('a new flag is new', R.newFlags(was, [{ code: 'RX9', severity: 'urgent', key: 'RX9', text: 'x' }]).map((x) => x.code), ['RX9']);

/* ── The scaffold ──────────────────────────────────────────────────────────── */
const sc = (vals, photos = {}, signed = []) => R.makeCtx({ trade: 'scaffolder', answers: wrap(vals), design, system, products: ['solar'], sides: ['front', 'rear'], photos, reads: [], address: '12 High Street', signed });
const upDone = { SC1: 'no', SC2: 'yes', SC3: 'no', SC4: 'yes', SCX2: 'no', SCX3: 'no', SCX4: 'yes' };
const upPhotos = { 'SCX1:front': 1, 'SCX1:rear': 1 };
s = R.signCheck(SCAFFOLD_UP, sc(upDone, upPhotos));
eq('scaffold up signs with SC3 = No, flagged Urgent "Needs tagging"', [s.ok, s.flags.map((x) => `${x.code}:${x.severity}`)], [true, ['SC3:urgent']]);
eq('one photo slot per side from the survey', R.missing(SCAFFOLD_UP, sc(upDone, { 'SCX1:front': 1 })).must.map((m) => m.why), ['A photo from the rear']);
eq('the strike isn’t open before the erection is signed', R.openForms([SCAFFOLD_UP, SCAFFOLD_DOWN], []).map((x) => x.stage), ['erection']);
eq('…and opens after it', R.openForms([SCAFFOLD_UP, SCAFFOLD_DOWN], ['erection']).map((x) => x.stage), ['erection', 'strike']);
eq('after the erection: the tag and the strike stay open', R.lateKeysOf([SCAFFOLD_UP, SCAFFOLD_DOWN], ['erection']).slice(0, 2), ['SC3', 'SC3p']);
eq('…every strike key too', R.lateKeysOf([SCAFFOLD_UP, SCAFFOLD_DOWN], ['erection']).includes('SS2'), true);
eq('after the strike: only the tag', R.lateKeysOf([SCAFFOLD_UP, SCAFFOLD_DOWN], ['erection', 'strike']), ['SC3', 'SC3p']);
eq('a tag photo added later clears the flag', R.flagsFor(SCAFFOLD_UP, sc({ ...upDone, SC3: 'yes' }, { ...upPhotos, SC3p: 1 }, ['erection'])).length, 0);
eq('strike damage with none before: Urgent', R.flagsFor(SCAFFOLD_DOWN, sc({ ...upDone, SS3: 'yes' }, {}, ['erection'])).map((x) => x.severity), ['urgent']);
eq('strike damage with marks before: Review', R.flagsFor(SCAFFOLD_DOWN, sc({ ...upDone, SC1: 'yes', SS3: 'yes' }, {}, ['erection'])).map((x) => x.severity), ['review']);

/* ── Keys: unique, and they never change once used (FORMS 0.8) ─────────────── */
const all = [ROOFER, SCAFFOLD_UP, SCAFFOLD_DOWN].flatMap((form) => [...form.steps.flatMap((x) => x.fields), form.sig]).map((x) => x.key);
eq('every key is unique across the forms', all.length === new Set(all).size, true);
eq('roofer keys (a change here means a key was renamed: add a new one instead)', [...ROOFER.steps.flatMap((x) => x.fields), ROOFER.sig].map((x) => x.key).join(' '),
  'RF1 RF5 RF5p RF5n RF12 RF13 RF14 RF2 RX1 RX1n RX1p RF10 RF11 RX5 RF6 RF6n RF6p RF7 RF7a RF7b RF8 RF8n RF9 RF9n RX4 RX4p RX7 RX7p RF3 RF4 RF4n RF4p RX2 RX2n RX2p RX3 RX3c RX3r RX3p RX6 RX6n RX6p RX8 RX8n RX9 RX9n RF_SIG');
eq('scaffold keys', [SCAFFOLD_UP, SCAFFOLD_DOWN].flatMap((form) => [...form.steps.flatMap((x) => x.fields), form.sig]).map((x) => x.key).join(' '),
  'SC1 SC1p SC1n SC2 SC2n SCX1 SC3 SC3p SC4 SCX2 SCX2p SCX2n SCX3 SCX3a SCX4 SC5 SC_SIG SS1 SS1n SS2 SS3 SS3p SS3n SS4 SS4n SS5 SS_SIG');
eq('schemaFor: the roofer gets the roof checks; the scaffolder up then down', [F.schemaFor({ trade: 'roofer' }).map((x) => x.id), F.schemaFor({ trade: 'scaffolder' }).map((x) => x.id)], [['roofer'], ['scaffold-erection', 'scaffold-strike']]);
eq('the schema version (4: the records in Heliaxis’s own words, after 3: the EIC to the IET A4:2026 form)', F.SITE_SCHEMA_VERSION, 4);

/* ── Derived values ────────────────────────────────────────────────────────── */
eq('expected string Voc: panels × Voc', R.expectedStringVoc(8, 49.6, false), 396.8);
eq('…none with optimisers', R.expectedStringVoc(8, 49.6, true), null);
eq('the DC rating check: highest string Voc × 1.25', R.dcRatingLimit([396.8, 347.2, null]), 496);
eq('insulation resistance: 1 MΩ at 500 V, 0.5 MΩ at 250 V', [R.irMinimum(500), R.irMinimum(1000), R.irMinimum(250)], [1, 1, 0.5]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
