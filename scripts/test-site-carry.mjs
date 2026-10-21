// Asked once, carried across (src/lib/site/forms/electrician/carry.ts) and one set of earthing codes
// (src/lib/site/earthing.ts), the round-1 fixes from the prefill audit: the survey's, the EV record's
// and the EIC's earthing read each other correctly (the survey's offered, never filled in); the
// installation's earth electrode is typed once and carried to the other boxes about the same
// electrode (never to a charger's own rod or an island-mode electrode on a PME supply); the heat
// pump's insulation test is typed once, on its record or on its circuit, at 500 V, single-phase; what's
// carried counts for the gate, isn't stored as their answer, says where it came from, never beats
// their own answer, agrees with when the forms ask each box, and is printed on every document that
// has the box (the EV and heat pump records, the battery switch-on and test record, the EIC).
// Usage: node --experimental-strip-types scripts/test-site-carry.mjs
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
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

const F = await import('../src/lib/site/forms/index.ts');
const R = await import('../src/lib/site/rules.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const EA = await import('../src/lib/site/earthing.ts');
const C = await import('../src/lib/site/forms/electrician/carry.ts');
const M = await import('../src/lib/site/forms/electrician/eic-model.ts');
const E = await import('../src/lib/site/forms/electrician/eic.ts');
const EVF = await import('../src/lib/site/forms/electrician/ev.ts');
const { SOURCE_LABEL } = await import('../src/lib/site/types.ts');
const FIX = await import('../src/lib/site/fixed/iet-eic.ts');
const REC = await import('../src/lib/documents/site/records.ts');
const BATD = await import('../src/lib/documents/site/battery.ts');
const { eicPdf } = await import('../src/lib/documents/eic/eic.ts');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const X = await import('./site-electrician-fixtures.mjs');
const EF = await import('./site-eic-fixture.mjs');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const { DESIGN } = X;
const { ctxOf, formFor, fillAll, input } = X.makeFixtures({ R, F, designOf });
const text = async (bytes) => (await X.textOf(pdfjs, bytes)).join(' ').replace(/\s+/g, ' ');

const ALL = ['solar', 'battery', 'ev', 'heatpump'];
const form = formFor(ALL);
const fieldOf = (k) => form.steps.flatMap((s) => s.fields).find((f) => f.key === k);
const shown = (c) => R.allVisible(form, c).map(({ f }) => f.key);
const offer = (k, c) => {
  const s = fieldOf(k).suggest?.(c);
  return s ? [s.src, s.v] : null;
};
/** The certificate made in the app (the office's choice). */
const EIC = { cert_route: 'eic' };
const job = (products, values = {}, el = {}) => ctxOf(products, values, {}, { ...EIC, ...el });

/* ── One set of earthing codes ─────────────────────────────────────────────── */

eq('the survey’s answers in the EIC’s codes ("Don’t know" is nothing)', ['tncs', 'tns', 'tt', 'unknown', undefined].map(EA.earthingFromSurvey), ['tn_c_s_pme', 'tn_s', 'tt', null, null]);
eq('the EV record’s answers in the EIC’s codes', ['tn_s', 'tncs_pme', 'tncs_pnb', 'tt', 'tn_c_s_pme'].map(EA.earthingFromEv), ['tn_s', 'tn_c_s_pme', 'tn_c_s_pnb', 'tt', null]);
eq('…and back: IT and TN-C aren’t on the EV record, so they’re never carried as something else', ['tn_s', 'tn_c_s_pme', 'tn_c_s_pnb', 'tt', 'it', 'tn_c', 'tncs_pme'].map(EA.earthingToEv), ['tn_s', 'tncs_pme', 'tncs_pnb', 'tt', null, null, null]);
eq('the EIC’s choices are the mapping’s codes, labelled the same', E.EARTHING.map((o) => EA.EARTHING_LABEL[o.key] === o.label), [true, true, true, true, true, true]);
eq('the EV record keeps its own keys, each labelled as the EIC labels it', EVF.EARTHING.map((o) => [o.key, o.label]), [
  ['tn_s', 'TN-S'],
  ['tncs_pme', 'TN-C-S (PME)'],
  ['tncs_pnb', 'TN-C-S (PNB)'],
  ['tt', 'TT'],
]);

/* ── The survey's earthing: offered to confirm on site, never filled in ───── */

const surveyed = job(['ev'], {}, { survey_earthing: 'tn_c_s_pme' });
eq('the survey’s TN-C-S (PME) is offered on the EV record and the EIC, each in its own keys', [offer('ev_earthing', surveyed), offer('eic_earthing', surveyed)], [
  ['survey', 'tncs_pme'],
  ['survey', 'tn_c_s_pme'],
]);
eq('…said to be from the survey, and not filled in', [SOURCE_LABEL.survey, surveyed.values.ev_earthing, surveyed.values.eic_earthing, surveyed.carried], ['From the survey', undefined, undefined, undefined]);
eq('a TT survey offers TT; "Don’t know" (nothing) offers nothing', [offer('ev_earthing', job(['ev'], {}, { survey_earthing: 'tt' })), offer('eic_earthing', job(['ev'], {}, { survey_earthing: null }))], [['survey', 'tt'], null]);
eq('an old job pack without the survey’s earthing offers nothing', offer('ev_earthing', ctxOf(['ev'], {}, {}, { ...EIC, survey_earthing: undefined })), null);

/* ── Earthing: the EV record and the EIC ───────────────────────────────────── */

const e1 = job(['ev'], { ev_earthing: 'tncs_pme' });
eq('the EV record’s earthing is carried to the EIC, in the EIC’s code, saying where from', [e1.values.eic_earthing, e1.carried.eic_earthing], ['tn_c_s_pme', { from: 'the EV charger record' }]);
eq('…counted as answered (the gate doesn’t ask it again) and not stored as their answer', [R.missing(form, e1).must.some((m) => m.key === 'eic_earthing'), 'eic_earthing' in R.recordAnswers(form, e1), 'eic_earthing' in e1.answers], [false, false, false]);
const e2 = job(['ev'], { eic_earthing: 'tt' });
eq('the EIC’s TT is carried to the EV record in its own key, and the electrode questions follow it', [e2.values.ev_earthing, shown(e2).includes('ev_ra'), shown(e2).includes('ev_openpen')], ['tt', true, false]);
eq('the EIC’s IT can’t be said on the EV record: nothing carried', job(['ev'], { eic_earthing: 'it' }).values.ev_earthing, undefined);
const e3 = job(['ev'], { ev_earthing: 'tt', eic_earthing: 'tn_s' });
eq('their own answers always stand (both given: nothing carried)', [e3.values.ev_earthing, e3.values.eic_earthing, e3.carried], ['tt', 'tn_s', undefined]);
eq('their own certificate (no EIC in the app): nothing carried into the EIC', ctxOf(['ev'], { ev_earthing: 'tt' }).values.eic_earthing, undefined);
eq('no EV on the job: nothing carried into the EV record', job(['solar'], { eic_earthing: 'tt' }).values.ev_earthing, undefined);
const roofer = R.makeCtx({ trade: 'roofer', answers: X.wrap({ ev_earthing: 'tt' }), design: designOf(DESIGN), system: X.SYSTEM, products: ['solar', 'ev'], sides: [], photos: {}, reads: [], address: '', signed: [] });
eq('only on the electrician’s pack', [roofer.carried, roofer.values.eic_earthing], [undefined, undefined]);

/* ── The installation's earth electrode (TT): one reading, type and place ─── */

const tt = (values, products = ['ev', 'battery']) => job(products, { eess_backup: 'yes', ...values });
const t1 = tt({ eic_earthing: 'tt', eic_ra: 21, eic_rod_type: 'Rod', eic_rod_loc: 'By the back door' });
eq('the EIC’s RA is carried to the EV record and the back-up changeover test', [t1.values.ev_ra, t1.values.bat_bu_ra, t1.carried.ev_ra, t1.carried.bat_bu_ra], [21, 21, { from: 'the certificate' }, { from: 'the certificate' }]);
eq('…and its type and where it is, to the EV record', [t1.values.ev_rod_type, t1.values.ev_rod_loc], ['Rod', 'By the back door']);
eq('…so the EV record asks none of them again', R.missing(form, t1).must.filter((m) => ['ev_ra', 'ev_rod_type', 'ev_rod_loc'].includes(m.key)), []);
const t2 = tt({ ev_earthing: 'tt', ev_ra: 23.5, ev_rod_type: 'Rod', ev_rod_loc: 'Front garden' });
eq('typed first on the EV record: the EIC gets the earthing and the electrode (and asks for it), the back-up test the reading', [t2.values.eic_earthing, t2.values.eic_ra, t2.values.eic_rod_type, t2.values.bat_bu_ra, t2.carried.eic_ra], ['tt', 23.5, 'Rod', 23.5, { from: 'the EV charger record' }]);
eq('…what the EIC still asks of the electrode is only what isn’t carried (RA or Ze)', R.missing(form, t2).must.filter((m) => ['eic_ra', 'eic_ra_kind', 'eic_rod_type', 'eic_rod_loc'].includes(m.key)).map((m) => m.key), ['eic_ra_kind']);
const t3 = tt({ eic_earthing: 'tt', eic_ra: 21, ev_ra: 22 });
eq('two readings typed: each stands; the box left takes the first in the order the phone asks', [t3.values.ev_ra, t3.values.eic_ra, t3.values.bat_bu_ra, t3.carried.bat_bu_ra.from], [22, 21, 22, 'the EV charger record']);
const t4 = tt({ bat_bu_ra: 19, eic_means: 'electrode', eic_earthing: 'tt' }, ['battery']);
eq('typed first in the battery tests, on a TT job: carried to the EIC', [t4.values.eic_ra, t4.carried.eic_ra.from], [19, 'the battery tests']);
const p1 = job(['ev', 'battery'], { eess_backup: 'yes', ev_earthing: 'tncs_pme', ev_openpen: 'electrode', ev_ra: 45 });
eq('PME, the charger on its own rod: a different electrode, carried nowhere', [shown(p1).includes('ev_ra'), p1.values.eic_ra, p1.values.bat_bu_ra, p1.carried?.eic_ra], [true, undefined, undefined, undefined]);
const p2 = job(['battery'], { eess_backup: 'yes', bat_bu_ra: 12, eic_earthing: 'tn_c_s_pme', eic_means: 'distributor' });
eq('PME with back-up: the island-mode electrode isn’t the installation’s, so nothing is carried', [p2.values.eic_ra, p2.carried], [undefined, undefined]);
eq('no back-up: the battery test’s electrode box isn’t asked, so nothing goes into it', tt({ eess_backup: 'no', eic_earthing: 'tt', eic_ra: 21 }).values.bat_bu_ra, undefined);
eq('a stale answer to a question no longer asked is never carried', job(['ev'], { ev_earthing: 'tn_s', ev_ra: 30, eic_earthing: 'tt' }).values.eic_ra, undefined);
eq('the electrode photo (EP37) is asked on a TT installation whichever form says TT', [shown(job(['solar'], { eic_earthing: 'tt' })).includes('EP37'), shown(job(['solar'], { eic_means: 'electrode' })).includes('EP37'), shown(job(['ev'], { ev_earthing: 'tt' })).includes('EP37'), shown(job(['solar'], { eic_earthing: 'tn_c_s_pme' })).includes('EP37')], [true, true, true, false]);
eq('Minor Works has no origin section: nothing carried into its RA', job(['ev'], { eic_route: 'meiwc', ev_earthing: 'tt', ev_ra: 23.5 }).values.eic_ra, undefined);

// The carry's "asked about this electrode" rules agree with when the forms ask each box.
const disagree = [];
for (const products of [['ev'], ['battery'], ['ev', 'battery'], ['solar', 'battery', 'ev', 'heatpump']]) {
  for (const route of ['eic', 'eic_single', 'meiwc', 'own']) {
    for (const eicE of [undefined, 'tt', 'tn_c_s_pme']) {
      for (const means of [undefined, 'electrode', 'distributor']) {
        for (const evE of [undefined, 'tt', 'tncs_pme']) {
          for (const pen of [undefined, 'electrode', 'device_charger']) {
            for (const backup of [undefined, 'yes', 'no']) {
              const values = Object.fromEntries(Object.entries({ eic_route: route, eic_earthing: eicE, eic_means: means, ev_earthing: evE, ev_openpen: pen, eess_backup: backup }).filter(([, v]) => v !== undefined));
              const c = job(products, values);
              const s = shown(c);
              const where = JSON.stringify({ products, ...values });
              if (C.eicElectrode(c) !== s.includes('eic_ra')) disagree.push(`eic_ra ${where}`);
              if (C.evElectrode(c) && !s.includes('ev_ra')) disagree.push(`ev_ra ${where}`);
              if (C.eessElectrode(c) && !s.includes('bat_bu_ra')) disagree.push(`bat_bu_ra ${where}`);
              for (const k of Object.keys(c.carried ?? {})) if (!k.includes('.') && !s.includes(k)) disagree.push(`carried into ${k}, not asked: ${where}`);
            }
          }
        }
      }
    }
  }
}
eq('carried only into boxes the forms ask, and the EIC’s electrode exactly when it asks it', disagree.slice(0, 5), []);

/* ── The heat pump's insulation test: its record and its circuit on the EIC ── */

const board = { 'eic_db:b-b1': { o: 1, ref: 'DB1', free: 4 } };
const hpc = (extra = {}, desc = 'Heat pump supply') => ({ ...board, 'eic_db:c-h1': { board: 'b1', o: 1, n: '4', desc, sug: 'heatpump', ...extra } });
const cols = (c, ks = ['ir_v', 'ir_ll', 'ir_le']) => ks.map((k) => c.values['eic_db:c-h1'][k]);
const h1 = job(['heatpump'], { hp_phase: 'single', hp_ir_le: '>999', hp_ir_ln: 250, ...hpc() });
eq('typed on the heat pump record: carried to its circuit’s Live - Earth and Live - Live, with the 500 V it was taken at', cols(h1), [500, 250, '>999']);
eq('…said where from', Object.entries(h1.carried).map(([k, v]) => [k, v.from]).sort(), [
  ['eic_db:c-h1.ir_le', 'the heat pump supply record'],
  ['eic_db:c-h1.ir_ll', 'the heat pump supply record'],
  ['eic_db:c-h1.ir_v', 'the heat pump supply record'],
]);
const h1x = M.boardsOf(h1.values).circuits[0];
eq('…the circuit’s test results don’t list them any more', M.missingProps(M.TESTS, h1x, M.propCtx(h1)).filter((l) => /Insulation/.test(l)), []);
eq('…and the stored circuit is still only what was typed', Object.keys(R.recordAnswers(form, h1)['eic_db:c-h1'].v).filter((k) => k.startsWith('ir_')), []);
const h2 = job(['heatpump'], { hp_phase: 'single', ...hpc({ ir_v: 500, ir_le: 300, ir_ll: '>999' }) });
eq('typed on the circuit first, at 500 V: carried to the heat pump record', [h2.values.hp_ir_le, h2.values.hp_ir_ln, h2.carried.hp_ir_le.from], [300, '>999', 'the certificate, DB1 circuit 4 (Heat pump supply)']);
const h3 = job(['heatpump'], { hp_phase: 'single', hp_ir_le: 400, ...hpc({ ir_v: 250 }) });
eq('a circuit tested at 250 V isn’t the record’s 500 V test: nothing carried either way', [cols(h3), h3.carried], [[250, undefined, undefined], undefined]);
eq('…the circuit’s own 250 V readings aren’t carried to the 500 V record either', job(['heatpump'], { hp_phase: 'single', ...hpc({ ir_v: 250, ir_le: 300 }) }).values.hp_ir_le, undefined);
eq('three-phase: line to neutral isn’t live to live, so nothing is carried', [job(['heatpump'], { hp_phase: 'three', hp_ir_le: 400, ...hpc() }).carried, job(['heatpump'], { eic_live: 'ac_3p4w', hp_ir_le: 400, ...hpc() }).carried], [undefined, undefined]);
eq('no heat pump circuit on the EIC yet: nothing to carry', job(['heatpump'], { hp_ir_le: 400, ...board }).carried, undefined);
eq('a circuit added by hand is found by its description', cols(job(['heatpump'], { hp_ir_le: 400, ...hpc({ sug: undefined }, 'Air source heat pump') }), ['ir_le']), [400]);
eq('their own reading on the circuit stands', cols(job(['heatpump'], { hp_phase: 'single', hp_ir_le: 400, hp_ir_ln: 410, ...hpc({ ir_le: 380 }) })), [500, 410, 380]);
eq('their own certificate: nothing carried', ctxOf(['heatpump'], { hp_ir_le: 400, ...hpc() }).carried, undefined);

/* ── On paper: each document's box is filled with what was carried ────────── */

const fe = fillAll(formFor(['ev']), ['ev'], {}, { ev_earthing: 'tt' });
for (const k of ['ev_ra', 'ev_rod_type', 'ev_rod_loc']) delete fe.values[k];
const evc = ctxOf(['ev'], { ...fe.values, eic_route: 'eic', eic_earthing: 'tt', eic_ra: 21.4, eic_rod_type: 'Rod', eic_rod_loc: 'By the back door' }, fe.photos);
const evText = await text(await REC.makeEvRecord(input(evc)));
eq('the EV record prints the electrode from the EIC', ['Measured RA 21.4 Ω', 'Earth electrode type Rod', 'Where the electrode is By the back door'].filter((x) => !evText.includes(x)), []);

const fh = fillAll(formFor(['heatpump']), ['heatpump'], {}, { hp_phase: 'single' });
delete fh.values.hp_ir_le;
delete fh.values.hp_ir_ln;
const hpcx = ctxOf(['heatpump'], { ...fh.values, eic_route: 'eic', ...hpc({ ir_v: 500, ir_le: 300, ir_ll: '>999' }) }, fh.photos);
const hpText = await text(await REC.makeHpRecord(input(hpcx)));
eq('the heat pump record prints the insulation readings from the circuit', ['Insulation resistance, line to earth (500 V) 300 MΩ', 'Insulation resistance, line to neutral (500 V) >999 MΩ'].filter((x) => !hpText.includes(x)), []);

const fb = fillAll(formFor(['battery']), ['battery'], {}, { eess_backup: 'yes' });
delete fb.values.bat_bu_ra;
const batc = ctxOf(['battery'], { ...fb.values, eic_route: 'eic', eic_earthing: 'tt', eic_ra: 21.4 }, fb.photos);
eq('the battery switch-on and test record prints the back-up test’s electrode reading from the EIC', (await text(await BATD.makeBatteryTests(input(batc)))).includes('Earth electrode resistance: 21.4 Ω'), true);

// The EIC: its earthing and electrode from the EV record, the heat pump circuit's insulation from its record.
const ans = EF.full(FIX.INSPECTIONS, E.INSPECTION_KEY);
delete ans.eic_earthing;
const hpCircuit = { ...EF.details(10, 'Heat pump supply', { sug: 'heatpump' }), ...EF.tests, ir_v: undefined, ir_ll: undefined, ir_le: undefined, remarks: 'Heat pump isolated for the insulation resistance test' };
const eicAns = {
  ...ans,
  eic_means: EF.a('electrode'),
  eic_ra_kind: EF.a('RA'),
  'eic_db:c-c4': EF.a(JSON.parse(JSON.stringify(hpCircuit))),
  ...X.wrap({ ev_earthing: 'tt', ev_ra: 21.4, ev_rod_type: 'Rod', ev_rod_loc: 'Front garden', hp_phase: 'single', hp_ir_le: 350, hp_ir_ln: 420 }),
};
const eicCtx = R.makeCtx({ trade: 'electrician', answers: eicAns, design: designOf({}), system: { kwp: 5.28, panel_count: 12, panel_model: null, inverter_model: 'GivEnergy Gen 3 5 kW', battery_model: 'GivEnergy 9.5 kWh' }, products: ALL, sides: [], photos: { eic_sig_con: 1, eic_sig_ins: 1 }, reads: [], address: '12 High Street, Maindee, Newport, NP20 4AB', signed: [], eic: EF.FACTS });
eq('the EIC with its earthing, electrode and heat pump insulation carried: nothing missing', E.certMissing(eicCtx).map((m) => `${m.label}: ${m.why}`), []);
const sig = { png: EF.scribble(), at: '2026-11-03T16:20:00Z' };
const DESIGNER = { name: 'Sarah Jones', company: 'Heliaxis Ltd', address: '9 Turner Street, Newport, Gwent', postcode: 'NP19 7AZ', tel: '01633 965205', next_n: 10, next_unit: 'years', departures: null, signed_at: '2026-11-04T09:10:00Z', path: 'x.png', by: null, png: EF.scribble() };
let eicText = '';
try {
  eicText = await text(await eicPdf({ route: 'eic', ref: 'HX-0042-EIC', jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: eicCtx.values, address: eicCtx.address, sig: { con: sig, ins: sig }, design: DESIGNER, draft: false }));
} catch (e) {
  eicText = `threw: ${e.message}`;
}
eq('…the final certificate is made (a missing answer would stop it) and prints them', ['Rod', 'Front garden', '21.4', '350', '420', 'Heat pump supply'].filter((x) => !eicText.includes(x)), []);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
