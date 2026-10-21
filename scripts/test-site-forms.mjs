// The site app's forms (src/lib/site/forms/*) and the job's design details (src/lib/site/design.ts):
// which paperwork each mix of technologies gets, that every key is unique and none is ever removed,
// and how the design details are cleaned.
// Usage: node --experimental-strip-types scripts/test-site-forms.mjs
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
const { cleanDesign, designInput, designOf, intListWords, parseIntList } = await import('../src/lib/site/design.ts');
const { formsFor, formsMissing, rooferApplies, suggestedTrades } = await import('../src/lib/site/forms/index.ts');
const { jobStrip } = await import('../src/lib/site/strip.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── Design details ────────────────────────────────────────────────────────── */

eq('"8 + 8" is two strings of 8', parseIntList('8 + 8'), [8, 8]);
eq('"8,8" too', parseIntList('8,8'), [8, 8]);
eq('"10 9 8"', parseIntList('10 9 8'), [10, 9, 8]);
eq('"8 and 7"', parseIntList('8 and 7'), [8, 7]);
eq('"eight" is refused', parseIntList('eight'), null);
eq('"8 + 0" is refused (a string has panels)', parseIntList('8 + 0'), null);
eq('"8.5" is refused', parseIntList('8.5'), null);
eq('empty is nothing', parseIntList(''), []);
eq('a list from the database stays', parseIntList([8, 8]), [8, 8]);
eq('words for the box', intListWords([8, 8]), '8 + 8');
eq('strings save as a list', cleanDesign('strings_design', '8 + 8'), { ok: true, value: [8, 8] });
eq('"eight" says what to type', cleanDesign('strings_design', 'eight'), { ok: false, error: 'Numbers only, e.g. 8 + 8' });
eq('clearing strings', cleanDesign('strings_design', ''), { ok: true, value: null });
eq('yes / no', [cleanDesign('optimisers', 'yes'), cleanDesign('optimisers', 'no'), cleanDesign('optimisers', '')], [
  { ok: true, value: true },
  { ok: true, value: false },
  { ok: true, value: null },
]);
eq('mounting is one of the four', [cleanDesign('mounting', 'in_roof').ok, cleanDesign('mounting', 'tiles').ok], [true, false]);
eq('battery class 1 to 4, kept as a number', [cleanDesign('eess_class', '3'), cleanDesign('eess_class', '5').ok], [{ ok: true, value: 3 }, false]);
eq('shade factor 0 to 1', [cleanDesign('shade_factor', '0.85'), cleanDesign('shade_factor', '1.5').ok], [{ ok: true, value: 0.85 }, false]);
eq('an unknown key is refused', cleanDesign('rate', '1').ok, false);
const d = designOf({ strings_design: [8, 8], optimisers: false, mounting: 'on_roof', eess_class: 2, kwp: 5.28 });
eq('designOf reads what is set', [d.strings_design, d.optimisers, d.mounting, d.eess_class], [[8, 8], false, 'on_roof', 2]);
eq('and leaves the rest empty, never a guess', [d.battery_backup, d.bs7671_edition, d.est_kwh_year, d.battery_kw], [null, null, null, null]);
eq('designOf ignores junk', designOf({ strings_design: 'lots', mounting: 'tiles', optimisers: 'yes' }).strings_design, null);
eq('the box shows a list as typed', [designInput('strings_design', [8, 8]), designInput('optimisers', false), designInput('optimisers', undefined)], ['8 + 8', 'no', '']);

/* ── Technologies → paperwork (SPEC 5.1) ──────────────────────────────────── */

eq('solar only', formsFor(['solar']), ['photos', 'serials', 'f43', 'f44', 'f44a', 'f78', 'cert', 'finish']);
eq('battery only: F74, no F43', formsFor(['battery']), ['photos', 'serials', 'f74', 'f78', 'cert', 'finish']);
eq('battery with PAS 63100', formsFor(['battery'], { pas63100: true }), ['photos', 'serials', 'f74', 'pas63100', 'f78', 'cert', 'finish']);
eq('solar + battery: both', formsFor(['solar', 'battery']), ['photos', 'serials', 'f43', 'f44', 'f44a', 'f74', 'f78', 'cert', 'finish']);
eq('EV only: the EV record and the certificate', formsFor(['ev']), ['photos', 'serials', 'ev', 'cert', 'finish']);
eq('heat pump only: the supply record and the certificate', formsFor(['heatpump']), ['photos', 'serials', 'heatpump', 'cert', 'finish']);
eq('infrared / LED / other: certificate and common photos only', [formsFor(['infrared']), formsFor(['led']), formsFor(['other'])], [
  ['photos', 'cert', 'finish'],
  ['photos', 'cert', 'finish'],
  ['photos', 'cert', 'finish'],
]);
eq('order is always the phone’s order', formsFor(['heatpump', 'ev', 'battery', 'solar']), ['photos', 'serials', 'f43', 'f44', 'f44a', 'f74', 'ev', 'heatpump', 'f78', 'cert', 'finish']);
eq('a battery added later: what’s missing', formsMissing(formsFor(['solar']), ['solar', 'battery']), ['f74']);
eq('the roofer is for solar jobs', [rooferApplies(['solar']), rooferApplies(['battery']), rooferApplies(['solar', 'battery'])], [true, false, true]);
eq('suggested trades: solar', suggestedTrades(['solar']), ['scaffolder', 'roofer', 'electrician']);
eq('suggested trades: battery / EV / heat pump', [suggestedTrades(['battery']), suggestedTrades(['ev']), suggestedTrades(['heatpump'])], [['electrician'], ['electrician'], ['electrician']]);
eq('suggested trades: infrared', suggestedTrades(['infrared']), []);

/* ── The job strip ─────────────────────────────────────────────────────────── */

const labels = (s) => s.map((x) => `${x.label}:${x.state}`);
eq('nothing started', labels(jobStrip({ scaffold: [{ status: 'sent' }], roof: [{ status: 'sent' }], electrics: [{ status: 'draft' }] })), [
  'Scaffold:todo',
  'Roof:todo',
  'Electrics:todo',
  'Handover:todo',
]);
eq('scaffold up and tagged, roof done, electrics going', labels(jobStrip({ scaffold: [{ status: 'signed', tagged: true }], roof: [{ status: 'done' }], electrics: [{ status: 'started' }] })), [
  'Scaffold up ✓ (tagged):done',
  'Roof ✓:done',
  'Electrics in progress:now',
  'Handover:todo',
]);
eq('scaffold up, not tagged', labels(jobStrip({ scaffold: [{ status: 'signed', tagged: false }], roof: [], electrics: [] })), ['Scaffold up · needs tagging:warn', 'Handover:todo']);
eq('scaffold down', labels(jobStrip({ scaffold: [{ status: 'done', tagged: true, struck: true }], roof: [], electrics: [], handover_at: '2026-11-04T10:00:00Z' })), [
  'Scaffold down ✓:done',
  'Handover ✓:done',
]);
eq('cancelled trades don’t count', labels(jobStrip({ scaffold: [], roof: [{ status: 'cancelled' }], electrics: [{ status: 'done' }, { status: 'cancelled' }] })), ['Electrics ✓:done', 'Handover:todo']);
eq('two electricians, one done: in progress', labels(jobStrip({ scaffold: [], roof: [], electrics: [{ status: 'done' }, { status: 'sent' }] })), ['Electrics in progress:now', 'Handover:todo']);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
