// The EV charger paperwork on the electrician's phone (schema version 6): which sections an EV job
// gets, the EV record's new questions and when each is asked, the EV photos and their rules, the new
// flag, and how an assignment made before version 6 asks the new questions (should, never must).
// Usage: node --experimental-strip-types scripts/test-site-ev.mjs
import { registerHooks } from 'node:module';

// forms/index.ts imports the forms without ".ts", as the bundler expects.
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

const F = await import('../src/lib/site/forms/index.ts');
const R = await import('../src/lib/site/rules.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const { NEW_IN_V6 } = await import('../src/lib/site/forms/legacy.ts');
const { electrodeFitted } = await import('../src/lib/site/forms/electrician/photos.ts');
const { DESIGN, SYSTEM, facts, wrap } = await import('./site-electrician-fixtures.mjs');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
}

const ctxOf = (products, values = {}, photos = {}, design = DESIGN) =>
  R.makeCtx({ trade: 'electrician', answers: wrap(values), design: designOf(design), system: SYSTEM, products, sides: [], photos, reads: [], address: '1 Test Road, NP20 1AA', signed: [], el: facts() });
const form = (products, version = F.SITE_SCHEMA_VERSION, design = DESIGN) => F.schemaFor({ trade: 'electrician', forms: F.formsFor(products, designOf(design)), schema_version: version })[0];
const shown = (products, values = {}, version, design = DESIGN) => R.allVisible(form(products, version, design), ctxOf(products, values, {}, design)).map(({ f }) => f.key);
const has = (list, ...keys) => keys.map((k) => list.includes(k));

/* ── Sections ─────────────────────────────────────────────────────────────── */

eq('the schema version is 6 (the EV charger paperwork)', F.SITE_SCHEMA_VERSION, 6);
eq('EV only: photos, serials, the EV record, the certificate and finish', F.formsFor(['ev']), ['photos', 'serials', 'ev', 'cert', 'finish']);
eq('EV and solar: both sets, each once', F.formsFor(['ev', 'solar']), ['photos', 'serials', 'pvinspect', 'pvtests', 'pvswitchon', 'ev', 'summary', 'cert', 'finish']);
eq('EV and battery: the battery records too, EV once', F.formsFor(['ev', 'battery']), ['photos', 'serials', 'battery', 'ev', 'summary', 'cert', 'finish']);
const evSolar = form(['ev', 'solar']);
const keys = evSolar.steps.flatMap((s) => s.fields.map((f) => f.key));
eq('EV and solar: no key twice on the form', keys.filter((k, i) => keys.indexOf(k) !== i), []);

/* ── The EV record's new questions ────────────────────────────────────────── */

const always = ['ev_location', 'ev_afdd', 'ev_isolator', 'ev_cable', 'ev_kw', 'ev_tether', 'ev_lbl_cu', 'ev_lbl_chart', 'ev_lbl_charger', 'ev_lbl_rcd', 'ev_random', 'ev_firmware', 'ev_app', 'ev_test'];
const shownEv = (values = {}, products = ['ev']) => shown(products, values);
eq('asked on every EV job', has(shownEv(), ...always), always.map(() => true));
eq('every new question is one schema 6 added', always.every((k) => NEW_IN_V6.has(k)), true);
eq('the customer-shown confirms are asked', has(shownEv(), 'ev_show_start', 'ev_show_sched', 'ev_show_rcd', 'ev_show_iso', 'ev_show_lights', 'ev_show_contact', 'ev_show_warranty'), [true, true, true, true, true, true, true]);

// Location and the open-PEN question.
eq('PME, location not answered yet: open-PEN asked (nothing skipped)', has(shownEv({ ev_earthing: 'tncs_pme' }), 'ev_openpen'), [true]);
eq('PME, outdoors: open-PEN asked', has(shownEv({ ev_earthing: 'tncs_pme', ev_location: 'outdoor' }), 'ev_openpen'), [true]);
eq('PME, indoors only: open-PEN not asked', has(shownEv({ ev_earthing: 'tncs_pme', ev_location: 'indoor' }), 'ev_openpen'), [false]);
eq('PNB, indoors only: open-PEN not asked', has(shownEv({ ev_earthing: 'tncs_pnb', ev_location: 'indoor' }), 'ev_openpen'), [false]);
eq('TN-S outdoors: no open-PEN question', has(shownEv({ ev_earthing: 'tn_s', ev_location: 'outdoor' }), 'ev_openpen'), [false]);
eq('PME outdoors on its own rod: the rod questions', has(shownEv({ ev_earthing: 'tncs_pme', ev_location: 'outdoor', ev_openpen: 'electrode' }), 'ev_rod_type', 'ev_ra', 'ev_lbl_rod'), [true, true, true]);
eq('an electrode answer left over once indoors is chosen: no rod questions', has(shownEv({ ev_earthing: 'tncs_pme', ev_location: 'indoor', ev_openpen: 'electrode' }), 'ev_rod_type', 'ev_ra', 'ev_lbl_rod'), [false, false, false]);
eq('TT indoors: still the rod (the supply is earthed by it)', has(shownEv({ ev_earthing: 'tt', ev_location: 'indoor' }), 'ev_rod_type', 'ev_ra', 'ev_lbl_rod'), [true, true, true]);
eq('the electrode photo (EP37) follows the same rule', [
  electrodeFitted(ctxOf(['ev'], { ev_earthing: 'tncs_pme', ev_location: 'outdoor', ev_openpen: 'electrode' })),
  electrodeFitted(ctxOf(['ev'], { ev_earthing: 'tncs_pme', ev_location: 'indoor', ev_openpen: 'electrode' })),
], [true, false]);

// AFDD, isolator, cable, app, test charge.
eq('AFDD not required: asks why', [has(shownEv({ ev_afdd: 'fitted' }), 'ev_afdd_why')[0], has(shownEv({ ev_afdd: 'not_required' }), 'ev_afdd_why')[0]], [false, true]);
eq('isolator label only when one is fitted', [has(shownEv({ ev_isolator: 'no' }), 'ev_lbl_iso')[0], has(shownEv({ ev_isolator: 'yes' }), 'ev_lbl_iso')[0]], [false, true]);
eq('app not set up: asks why', has(shownEv({ ev_app: 'no' }), 'ev_app_n'), [true]);
eq('test charge not possible: asks why', [has(shownEv({ ev_test: 'vehicle' }), 'ev_test_n')[0], has(shownEv({ ev_test: 'not_possible' }), 'ev_test_n')[0]], [false, true]);
eq('dual-supply notice only with solar or a battery', [has(shownEv(), 'ev_lbl_dual')[0], has(shownEv({}, ['ev', 'solar']), 'ev_lbl_dual')[0], has(shownEv({}, ['ev', 'battery']), 'ev_lbl_dual')[0]], [false, true, true]);
eq('the DNO route hints at the rest of the ENA criteria', /every other criterion on the ENA form/.test(form(['ev']).steps.flatMap((s) => s.fields).find((f) => f.key === 'ev_dno').hint), true);

/* ── Photos ───────────────────────────────────────────────────────────────── */

eq('EV photos on every EV job (inside the charger, penetrations, circuit chart)', has(shownEv(), 'EP48', 'EP49', 'EP60'), [true, true, true]);
const photo = (key) => form(['ev']).steps.flatMap((s) => s.fields).find((f) => f.key === key);
eq('two each of inside the charger and penetrations; both sides hinted', [photo('EP48').need, photo('EP49').need, /both sides/.test(photo('EP49').hint)], [2, 2, true]);
eq('isolator photo (EP61) only when one is fitted', [has(shownEv({ ev_isolator: 'no' }), 'EP61')[0], has(shownEv({ ev_isolator: 'yes' }), 'EP61')[0]], [false, true]);
eq('buried-cable photo (EP62) only when some of it is buried', [has(shownEv({ ev_cable: ['clipped', 'swa'] }), 'EP62')[0], has(shownEv({ ev_cable: ['swa', 'buried'] }), 'EP62')[0]], [false, true]);
eq('no EV photos on a solar-only job', has(shown(['solar'], { ev_isolator: 'yes', ev_cable: ['buried'] }), 'EP48', 'EP49', 'EP60', 'EP61', 'EP62'), [false, false, false, false, false]);
eq('the every-job slots are as they were (EP02, EP03, EP07)', has(shown(['ev']), 'EP02', 'EP03', 'EP07'), [true, true, true]);

/* ── Flags ────────────────────────────────────────────────────────────────── */

const flags = (values) => R.flagsFor(form(['ev']), ctxOf(['ev'], values)).map((f) => [f.code, f.severity]);
eq('no test charge: Review, with the reason', [flags({ ev_test: 'not_possible', ev_test_n: 'No car on site' }).filter(([c]) => c === 'EV_TEST'), R.flagsFor(form(['ev']), ctxOf(['ev'], { ev_test: 'not_possible', ev_test_n: 'No car on site' })).find((f) => f.code === 'EV_TEST').text], [[['EV_TEST', 'review']], 'EV: no test charge: No car on site. Arrange one with the customer']);
eq('a test charge done: no flag', flags({ ev_test: 'adaptor' }).filter(([c]) => c === 'EV_TEST'), []);

/* ── Old assignments and old phones ───────────────────────────────────────── */

const levels = (version) => Object.fromEntries(form(['ev'], version).steps.flatMap((s) => s.fields).filter((f) => ['ev_location', 'ev_test', 'EP48', 'ev_earthing', 'EP40'].includes(f.key)).map((f) => [f.key, f.level]));
eq('version 6: the new questions are must', levels(6), { EP40: 'must', EP48: 'must', ev_earthing: 'must', ev_location: 'must', ev_test: 'must' });
eq('before version 6 (the column’s default, 1): the new ones are should, the rest as they were', levels(1), { EP40: 'must', EP48: 'should', ev_earthing: 'must', ev_location: 'should', ev_test: 'should' });
eq('no schema_version given (an old phone’s copy): read as before version 6', F.schemaFor({ trade: 'electrician', forms: ['photos', 'ev'] })[0].steps.flatMap((s) => s.fields).find((f) => f.key === 'ev_location').level, 'should');
const oldAnswers = { ev_earthing: 'tncs_pme', ev_openpen: 'device_charger', ev_openpen_how: 'Built-in PEN fault detection', ev_rcd: 'Type B RCD', ev_dedicated: true, ev_spd: 'assessed', ev_load: 'no', ev_maxdemand: 52, ev_fuse: 80, ev_online: 'yes', ev_hours: true, ev_soc: true, ev_dno: 'notify' };
const mustOf = (version) => R.missing(form(['ev'], version), ctxOf(['ev'], oldAnswers, { ev_cutout: 1 })).must.map((m) => m.key).filter((k) => k.startsWith('ev_'));
eq('an old job with every old EV answer: nothing must is missing on the EV record', mustOf(1), []);
eq('…but the same answers on a version 6 job are missing the new ones', mustOf(6).includes('ev_location') && mustOf(6).includes('ev_test'), true);
eq('an old answer to open-PEN still shows (location not answered on an old job)', has(shown(['ev'], oldAnswers, 1), 'ev_openpen', 'ev_openpen_how'), [true, true]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
