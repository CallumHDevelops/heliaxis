// Answers saved before the records were rewritten (schema version 4): preview jobs only. They are read
// under the new keys (forms/legacy.ts), a problem on an old row that was merged into another carries
// over, an answer given since under the new key stands, the records still print for a job signed
// before the change (the questions added since say so), and the system summary prints declaration (b)
// as the electrician signed it.
// Usage: node --experimental-strip-types scripts/test-site-legacy.mjs
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = { 'server-only': 'export {}', '@/lib/crm/server': "export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos';" };
registerHooks({
  resolve(specifier, context, next) {
    if (STUBS[specifier]) return { url: mod(STUBS[specifier]), shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (!/^(?:\.\.?\/|file:)/.test(spec) || /\.\w+$/.test(spec)) throw e;
      try {
        return next(`${spec}.ts`, context);
      } catch {
        return next(`${spec}/index.ts`, context);
      }
    }
  },
});

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const F = await import('../src/lib/site/forms/index.ts');
const L = await import('../src/lib/site/forms/legacy.ts');
const R = await import('../src/lib/site/rules.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const X = await import('./site-electrician-fixtures.mjs');
const { ctxOf, formFor, fillAll, input } = X.makeFixtures({ R, F, designOf });
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { MissingAnswer } = await import('../src/lib/documents/pdf-kit.ts');
const DOCS = {
  'HX-PV-01': (await import('../src/lib/documents/site/pv-inspect.ts')).makePvInspect,
  'HX-PV-02': (await import('../src/lib/documents/site/pv-tests.ts')).makePvTests,
  'HX-PV-03': (await import('../src/lib/documents/site/pv-switch-on.ts')).makePvSwitchOn,
  'HX-BAT-01': (await import('../src/lib/documents/site/battery.ts')).makeBatteryInspection,
  'HX-BAT-02': (await import('../src/lib/documents/site/battery.ts')).makeBatteryTests,
};
const textOf = async (bytes) => X.flat(await X.textOf(pdfjs, bytes));

/* ── A whole job as it was saved before version 4 ──────────────────────────────── */
// A careful solar + battery job under the new keys, written back under the keys it had before (the
// questions version 4 added left out, the mounting and the frame table as the old form held them).
const products = ['solar', 'battery'];
const form = formFor(products);
const full = fillAll(form, products);
const OLD_OF = L.LEGACY_KEYS;
const old = {};
for (const [k, v] of Object.entries(full.values)) {
  if (L.NEW_IN_V4.has(k) || /^pvi_(watertight|frame_earthed|frame_func)[np]?$/.test(k) || k === 'hos_decl') continue;
  old[OLD_OF[k] ?? k] = v;
}
old.f44_20_kind = 'pitched';
old.f44_t2 = ['d'];
eq('the old job uses the old keys only', Object.keys(old).filter((k) => /^(pvi|pvt|pvc|hos)_|^bat_/.test(k) && k !== 'bat_inv_sep'), []);
eq('it was saved before version 4', L.savedBeforeV4(old), true);
eq('a new job was not', L.savedBeforeV4(full.values), false);

const c = ctxOf(products, old, full.photos);
eq('read under the new keys: the string tests, the inspection, the switch-on, the battery, the summary', ['pvt_kind', 'pvi_kit', 'pvc_grid', 'bat_standards', 'bat_online', 'hos_circuits'].map((k) => c.values[k] !== undefined), [true, true, true, true, true, true]);
eq('the mounting and the frame table read across', [c.values.pvi_mount, c.values.pvi_frame_metal, c.values.pvi_frame_ext, c.values.pvi_frame_exp, c.values.pvi_frame_lp], ['on_roof', 'yes', 'no', 'no', 'no']);
eq('no old key reaches the forms', Object.keys(c.values).filter((k) => /^(f43_|f44|f74_|f78_|eess_[ta]_)/.test(k)), []);
const open = R.allVisible(F.schemaFor({ trade: 'electrician', forms: L.legacySections(['photos', 'serials', 'f43', 'f44', 'f44a', 'f74', 'f78', 'cert', 'finish']) })[0], c)
  .filter(({ f }) => f.level === 'must' && !['SIG', 'PHOTOS', 'AUTO'].includes(f.type) && !R.isAnswered(f, c))
  .map(({ f }) => f.key);
eq('left to answer on an unsigned job: only the questions version 4 added', open, ['pvi_watertight', 'pvi_frame_func']);

for (const [code, make] of Object.entries(DOCS)) {
  let text = '';
  try {
    text = await textOf(await make({ ...input(c), declaration: null }));
  } catch (e) {
    text = `THREW ${e.message}`;
  }
  eq(`${code} prints for a job signed before version 4`, text.startsWith('THREW') ? text : 'printed', 'printed');
  if (code === 'HX-PV-01') {
    eq('  the questions added since say they weren’t on it', (text.match(new RegExp(L.NOT_ON_EARLIER, 'g')) ?? []).length, 2);
    eq('  the old answers print: the mounting, what the frame needs', [text.includes('On-roof, above the tiles'), text.includes('The frame needs: no safety earth')], [true, true]);
  }
  if (code === 'HX-PV-02') eq('  the readings print', text.includes('394.8'), true);
}
// A job signed under version 4 with a must left empty still can't print (the guard is only for old answers).
{
  const rest = { ...full.values };
  delete rest.pvi_watertight;
  let threw = null;
  try {
    await DOCS['HX-PV-01']({ ...input(ctxOf(products, rest, full.photos)), declaration: null });
  } catch (e) {
    threw = e instanceof MissingAnswer ? e.label : String(e);
  }
  eq('a version 4 record with a must empty still stops', threw, 'Is the roof still watertight at every fixing?');
}

/* ── The value rules ───────────────────────────────────────────────────────────── */
const v = (raw) => L.withLegacy(raw);
eq('a problem on a merged row carries over, with its note, though the row it joined was ticked', (({ bat_standards, bat_standardsn, bat_manual, bat_manualn }) => ({ bat_standards, bat_standardsn, bat_manual, bat_manualn }))(v({ f74_1_01: 'done', f74_1_26: 'done', f74_1_03: 'problem', f74_1_03n: 'Isolator not to the maker’s instructions' })), {
  bat_standards: 'problem',
  bat_standardsn: 'Isolator not to the maker’s instructions',
  bat_manual: 'problem',
  bat_manualn: 'Isolator not to the maker’s instructions',
});
eq('both problems keep their notes', v({ f74_1_23: 'problem', f74_1_23n: 'IP rating too low', f74_1_09: 'problem', f74_1_09n: 'Damp garage' }).bat_conditionsn, 'IP rating too low; Damp garage');
eq('a merged row ticked doesn’t undo a problem', v({ f74_1_30: 'problem', f74_1_30n: 'Blocked by shelving', f74_1_15: 'done' }).bat_reach, 'problem');
eq('a merged row fills a row left unanswered', v({ f74_1_15: 'na' }).bat_reach, 'na');
eq('an answer given since under the new key stands', v({ f74_1_03: 'problem', f74_1_03n: 'x', bat_standards: 'done', bat_manual: 'done' }).bat_standards, 'done');
eq('the location check’s ventilation No: a problem on the ventilation row, even when that was ticked', (({ bat_space_vent, bat_space_ventn }) => ({ bat_space_vent, bat_space_ventn }))(v({ f74_1_22: 'done', bl_vent: 'no' })), {
  bat_space_vent: 'problem',
  bat_space_ventn: 'Not ventilated as the maker asks',
});
eq('the location check’s notices Yes: ticked where unanswered', v({ bl_notice: 'yes' }).bat_notices, 'done');
eq('Part 2’s notes join the inspection’s', v({ f74_1_notes: 'One', f74_2_notes: 'Two' }).bat_inspect_notes, 'One\nTwo');
eq('… once: notes saved since under the new key already hold them', v({ f74_2_notes: 'Two', bat_inspect_notes: 'One\nTwo' }).bat_inspect_notes, 'One\nTwo');
eq('the frame table: a and c', (({ pvi_frame_metal, pvi_frame_ext, pvi_frame_exp, pvi_frame_lp }) => [pvi_frame_metal, pvi_frame_ext, pvi_frame_exp, pvi_frame_lp])(v({ f44_t2: ['a', 'c'] })), ['yes', 'yes', undefined, 'yes']);
eq('the frame table: a and b can’t be read across', v({ f44_t2: ['a', 'b'] }).pvi_frame_metal, undefined);
eq('an assignment (or a phone’s saved copy of it) with the old section ids gets the same steps', F.schemaFor({ trade: 'electrician', forms: ['photos', 'serials', 'f43', 'f44', 'f44a', 'f74', 'f78', 'cert', 'finish'] })[0].steps.map((st) => st.key), form.steps.map((st) => st.key));
eq('the old section ids', L.legacySections(['photos', 'f43', 'f44', 'f44a', 'f74', 'pas63100', 'f78', 'cert', 'finish']), ['photos', 'pvtests', 'pvinspect', 'pvswitchon', 'battery', 'pas63100', 'summary', 'cert', 'finish']);

/* ── The system summary prints declaration (b) as signed ───────────────────────── */
{
  const I = await import('../src/lib/handover/inputs.ts');
  const H = await import('../src/lib/handover/settings-shared.ts');
  const DECL = await import('../src/lib/site/declaration.ts');
  const { summaryFacts } = await import('./site-summary-fixture.mjs');
  const { makeSummary } = await import('../src/lib/documents/handover/summary.ts');
  const base = summaryFacts({ H, designOf });
  const signed = DECL.electricianDeclaration('12 High Street, Maindee, Newport, NP20 4AB', ['pvinspect', 'pvtests', 'pvswitchon', 'summary'], ['solar'], '3 November 2026');
  const facts = { ...base, electrician: { ...base.electrician, declaration: signed } };
  const sum = I.summaryInput(facts);
  eq('the summary is ready', sum.ok, true);
  const t = await textOf(await makeSummary(sum.input, async () => X.PNG));
  // Signed on a solar-only job, printed now the job has a battery too: what was signed prints.
  eq('declaration (b) as signed', [t.includes('the work meets MCS MIS 3002 (solar PV).'), t.includes('the design meets MCS MIS 3002 (solar PV) and MCS MIS 3012 (battery storage)')], [true, true]);
  const unsigned = I.summaryInput(base);
  eq('without a stored declaration: as it reads for the job', unsigned.ok && unsigned.input.electrician.statement, DECL.SUMMARY_DECLARATIONS.install(DECL.summaryStandards(['solar', 'battery'])));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
