// The electrician's certificate (SPEC 3, REGS 1.2–1.5): src/lib/site/forms/electrician/{eic,eic-model,meiwc}.ts
// and the PDFs in src/lib/documents/eic/. Every field the model form has is asked for (checked against
// REGS 1.2's lists, copied below), the gate (a board, three circuits, instruments, signatures passes;
// any reading taken out reopens it with the circuit named), nothing measured is ever filled in, the
// routes (three-part, single signature, Minor Works, their own), the flags, and the PDF: portrait
// certificate pages, landscape schedules with columns 1–31 in order and their headings on every page.
// Usage: node --experimental-strip-types scripts/test-site-eic.mjs   (EIC_PDF_OUT=/dir keeps the PDFs)
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(spec) && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, context);
      throw e;
    }
  },
});
const E = await import('../src/lib/site/forms/electrician/eic.ts');
const M = await import('../src/lib/site/forms/electrician/eic-model.ts');
const W = await import('../src/lib/site/forms/electrician/meiwc.ts');
const R = await import('../src/lib/site/rules.ts');
const F = await import('../src/lib/site/forms/index.ts');
const FIX = await import('../src/lib/site/fixed/iet-eic.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const { eicPdf } = await import('../src/lib/documents/eic/eic.ts');
const { meiwcPdf } = await import('../src/lib/documents/eic/meiwc.ts');
const K = await import('../src/lib/documents/pdf-kit.ts');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const fs = await import('node:fs');
const { a, details, tests, full: fullOf, FACTS, scribble } = await import('./site-eic-fixture.mjs');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
async function pagesOf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    out.push({ w: Math.round(vp.width), h: Math.round(vp.height), text: (await p.getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' ') });
  }
  return out;
}
const OUT = process.env.EIC_PDF_OUT;
const keep = (name, bytes) => OUT && fs.writeFileSync(`${OUT}/${name}`, bytes);

/* ── A job and an EIC, filled in (test data only) ─────────────────────────── */

function ctxOf(answers, over = {}) {
  return R.makeCtx({
    trade: 'electrician',
    answers,
    design: designOf({}),
    system: { kwp: 5.28, panel_count: 12, panel_model: null, inverter_model: 'GivEnergy Gen 3 5 kW', battery_model: 'GivEnergy 9.5 kWh' },
    products: ['solar', 'battery'],
    sides: [],
    photos: { eic_sig_con: 1, eic_sig_ins: 1 },
    reads: [],
    address: '12 High Street, Maindee, Newport, NP20 4AB',
    signed: [],
    eic: FACTS,
    ...over,
  });
}
const without = (answers, key, prop) => {
  const next = { ...answers };
  if (prop) {
    const o = { ...next[key].v };
    delete o[prop];
    next[key] = a(o);
  } else delete next[key];
  return next;
};

/* ── REGS 1.2: every field on the model form has a place (copied from REGS.md) ─ */

const keysOf = new Set(E.EIC_STEPS.flatMap((s) => s.fields.map((f) => f.key)));
const fieldOf = (k) => E.EIC_STEPS.flatMap((s) => s.fields).find((f) => f.key === k);
const REGS_PAGE = {
  'Details of the client: name and address': ['eic_client', 'eic_client_addr'],
  'Description of the installation; extent covered': ['eic_desc', 'eic_extent'],
  'New installation / addition / alteration': ['eic_work'],
  'Departures from BS 7671': ['eic_dep', 'eic_dep_what'],
  'Permitted exceptions (Reg 411.3.3), risk assessment attached': ['eic_exc', 'eic_exc_what', 'eic_exc_ra'],
  'Construction and inspection & testing signatures': ['eic_sig_con', 'eic_sig_ins'],
  'Single-signature EIC: one signature': ['eic_sig_one'],
  'Next inspection (single signature: the electrician is the designer)': ['eic_next', 'eic_next_unit'],
  'Particulars of signatories: name, company, address, postcode, telephone': ['eic_sig_name', 'eic_sig_co', 'eic_sig_addr', 'eic_sig_pc', 'eic_sig_tel'],
  'Earthing arrangements': ['eic_earthing'],
  'Number and type of live conductors': ['eic_live'],
  'Confirmation of supply polarity': ['eic_polarity'],
  'Other sources of supply (schedule attached)': ['eic_other', 'eic_src'],
  'Nominal voltage U/U0, frequency f, Ipf, Ze (by enquiry or measurement)': ['eic_u0', 'eic_u', 'eic_f', 'eic_ipf', 'eic_ipf_how', 'eic_ze', 'eic_ze_how'],
  'Supply protective device: BS (EN), type, rated current': ['eic_sup_bs', 'eic_sup_type', 'eic_sup_a'],
  'Means of earthing': ['eic_means'],
  'Maximum demand': ['eic_md'],
  'Installation earth electrode: type, location, resistance to earth': ['eic_rod_type', 'eic_rod_loc', 'eic_ra'],
  'Earthing conductor: material, csa, verified': ['eic_ec_mat', 'eic_ec_csa', 'eic_ec_ok'],
  'Main protective bonding conductors: material, csa, verified': ['eic_mb_mat', 'eic_mb_csa', 'eic_mb_ok'],
  'Bonding: water, gas, oil, structural steel, lightning protection, other (specify)': ['eic_b_water', 'eic_b_gas', 'eic_b_oil', 'eic_b_steel', 'eic_b_lightning', 'eic_b_other', 'eic_b_other_what'],
  'Main switch: location, BS (EN), poles, current rating, fuse/device rating, voltage rating': ['eic_ms_loc', 'eic_ms_bs', 'eic_ms_poles', 'eic_ms_a', 'eic_ms_set', 'eic_ms_v'],
  'If RCD main switch: type, IΔn, rated time delay, measured operating time': ['eic_ms_rcd', 'eic_ms_rcd_type', 'eic_ms_idn', 'eic_ms_delay', 'eic_ms_time'],
  'Schedule of inspections (14 lines)': FIX.INSPECTIONS.map((_, i) => E.INSPECTION_KEY(i)),
  'Comments on existing installation (Reg 644.1.2)': ['eic_cmt', 'eic_cmt_more'],
  'Schedules of circuit details and test results': ['eic_db'],
  'Test instruments': ['eic_inst'],
};
const homeless = Object.entries(REGS_PAGE).flatMap(([what, ks]) => ks.filter((k) => !keysOf.has(k)).map((k) => `${what}: ${k}`));
eq('REGS 1.2 pages 1–3: every field is asked', homeless, []);
eq('earthing: TN-C, TN-S, TN-C-S split into PME and PNB (A4), TT, IT', E.EARTHING.map((o) => o.label).sort(), ['IT', 'TN-C', 'TN-C-S (PME)', 'TN-C-S (PNB)', 'TN-S', 'TT']);
eq('live conductors: four AC, two DC and other', E.LIVE.map((o) => o.key), ['ac_1p2w', 'ac_2p3w', 'ac_3p3w', 'ac_3p4w', 'dc_2w', 'dc_3w', 'other']);
eq('the 14 inspection lines, in order, as REGS 1.2', FIX.INSPECTIONS.map((x) => x.n), ['1.0', '2.0', '3.0', '4.0', '5.0', '6.0', '7.0', '8.0', '9.0', '10.0', '11.0', '12.0', '13.0', '14.0']);
eq('item 14.0 is prosumer installations', FIX.INSPECTIONS[13].label, 'Prosumer’s low voltage electrical installation(s)');
eq('every inspection line is ✓ / ✗ / N/A and a must', FIX.INSPECTIONS.map((_, i) => fieldOf(E.INSPECTION_KEY(i))).every((f) => f.type === 'TICK' && f.level === 'must'), true);
// Schedule of Circuit Details (columns 1–16) and Test Results (17–31): REGS 1.2's two tables.
const REGS_DETAILS = { 1: 'n', 2: 'desc', 3: 'wiring', 4: 'ref', 5: 'points', 6: 'csa_live', 7: 'csa_cpc', 8: 'ocpd_bs', 9: 'ocpd_type', 10: 'ocpd_a', 11: 'ocpd_ka', 12: 'zs_max', 13: 'rcd_bs', 14: 'rcd_type', 15: 'rcd_idn', 16: 'rcd_a' };
const REGS_TESTS = { 18: 'r1', 19: 'rn', 20: 'r2', 21: 'r12', 22: 'r2only', 23: 'ir_v', 24: 'ir_ll', 25: 'ir_le', 26: 'pol', 27: 'zs', 28: 'rcd_ms', 29: 'rcd_btn', 30: 'afdd_btn', 31: 'remarks' };
eq('circuit details: columns 1–16 in order', M.DETAILS.filter((p) => p.col).map((p) => [p.col, p.k]), Object.entries(REGS_DETAILS).map(([c, k]) => [Number(c), k]));
eq('test results: columns 18–31 in order (17 repeats the circuit number)', M.TESTS.filter((p) => p.col).map((p) => [p.col, p.k]), Object.entries(REGS_TESTS).map(([c, k]) => [Number(c), k]));
eq('board: reference, location, supplied from, distribution OCPD, SPD type, Zdb, Ipf at DB, polarity, phase sequence, SPD status', M.BOARD.map((p) => p.k), ['ref', 'loc', 'from', 'ocpd_bs', 'ocpd_type', 'ocpd_a', 'spd', 'zdb', 'ipf', 'pol', 'phase', 'spd_ok']);
eq('SPD types T1, T2, T3, N/A', M.BOARD.find((p) => p.k === 'spd').options.map((o) => o.key), ['T1', 'T2', 'T3', 'na']);
eq('test instruments: the six on the form', M.INSTRUMENTS.map((i) => i.k), ['mft', 'cont', 'ir', 'efli', 'rcd', 'earth']);
eq('wiring codes A–H and O', FIX.WIRING_CODES.map((w) => w.code), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'O']);
eq('declarations: design, construction, inspection; the edition filled in', ['design', 'construction', 'inspection'].map((k) => FIX.DECLARATION[k]('2026 (A4)').includes('BS 7671:2018 amended to 2026 (A4) (date)')), [true, true, true]);
eq('edition words', [FIX.editionWords('A4:2026'), FIX.editionWords('A2:2022+A3:2024'), FIX.editionWords(null)], ['2026 (A4)', '2024 (A3)', '2026 (A4)']);

/* ── The gate ─────────────────────────────────────────────────────────────── */

const full = () => fullOf(FIX.INSPECTIONS, E.INSPECTION_KEY);
const ans = full();
const c0 = ctxOf(ans);
eq('a board, three circuits, instruments and both signatures: nothing missing', E.certMissing(c0), []);
eq('and the certificate is complete', E.certComplete(c0), true);
const form = F.schemaFor({ trade: 'electrician', forms: F.formsFor(['solar', 'battery']) })[0];
eq('the electrician’s pack holds the certificate', [form.stage, form.steps.map((s) => s.key)], ['main', ['eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign']]);
eq('so the sign-off gate passes', R.signCheck(form, c0).ok, true);
const pc = M.propCtx(c0);
const reopened = [];
for (const id of ['c1', 'c2', 'c3']) {
  const x = c0.values[`eic_db:c-${id}`];
  for (const p of M.shownProps(M.TESTS, x, pc).filter((p) => p.level === 'must' && p.k in x)) {
    const miss = E.certMissing(ctxOf(without(ans, `eic_db:c-${id}`, p.k)));
    // R1 + R2 and R2 are either-or: taking R1 + R2 away with no R2 reopens it too.
    const want = `${M.circuitName({ ...x, id }, M.boardsOf(c0.values).boards)}: test results`;
    if (!miss.some((m) => m.label === want && m.step === 'eic-boards')) reopened.push(`${id}.${p.k}`);
  }
}
eq('taking out any reading reopens the gate, naming the circuit', reopened, []);
eq('e.g. Zs gone from circuit 8', E.certMissing(ctxOf(without(ans, 'eic_db:c-c2', 'zs'))).map((m) => [m.label, m.why]), [['DB1 circuit 8 (Battery inverter supply): test results', 'Maximum measured Zs']]);
eq('a board with no circuits', E.certMissing(ctxOf({ ...ans, 'eic_db:b-b2': a({ o: 2, ref: 'DB2', loc: 'Garage', from: 'DB1', spd: ['na'], zdb: 0.4, ipf: 1.1, pol: true }) })).map((m) => m.label), ['DB2: circuits']);
eq('no boards at all', E.certMissing(ctxOf(Object.fromEntries(Object.entries(ans).filter(([k]) => !k.startsWith('eic_db:'))))).some((m) => m.label.includes('consumer unit')), true);
eq('instruments: none', E.certMissing(ctxOf(without(ans, 'eic_inst'))).map((m) => m.why), ['The multi-functional tester (or each tester you used)']);
eq('instruments: single testers instead of a multi-functional', E.certMissing(ctxOf({ ...ans, eic_inst: a({ cont: 'A', ir: 'B', efli: 'C' }) })).map((m) => m.why), ['RCD']);
eq('a signature missing', E.certMissing(ctxOf(ans, { photos: { eic_sig_con: 1 } })).map((m) => m.label), ['Sign for the inspection and testing']);
eq('the design part and next inspection aren’t the electrician’s (three-part)', E.certMissing(c0).some((m) => /design|next/i.test(m.label)), false);
eq('the board’s readings count too', E.certMissing(ctxOf(without(ans, 'eic_db:b-b1', 'zdb'))).map((m) => [m.label, m.why]), [['DB1: board details', 'Zdb at the board']]);
eq('a TT supply asks for the electrode and its RA', E.certMissing(ctxOf({ ...ans, eic_earthing: a('tt') })).map((m) => m.key).sort(), ['eic_ra', 'eic_rod_loc', 'eic_rod_type']);
eq('three-phase asks U and the board’s phase sequence', E.certMissing(ctxOf({ ...ans, eic_live: a('ac_3p4w') })).map((m) => m.key + (m.why ? `:${m.why}` : '')), ['eic_u:Not answered', 'eic_db:Phase sequence correct']);
eq('the signed record keeps the boards and circuits (KEY:anything belongs to KEY)', Object.keys(R.recordAnswers(form, c0)).filter((k) => k.startsWith('eic_db:')).sort(), ['eic_db:b-b1', 'eic_db:c-c1', 'eic_db:c-c2', 'eic_db:c-c3']);
eq('progress counts each board and circuit', R.stepProgress(form.steps.find((s) => s.key === 'eic-boards'), c0), { done: 4, total: 4 });

/* ── Never filled in: no reading has a value until the electrician gives it ── */

const fresh = ctxOf({}, { photos: {} });
const MEASURED = ['eic_ipf', 'eic_ze', 'eic_ra', 'eic_md', 'eic_ms_time', 'eic_u0', 'eic_u', 'eic_f', 'eic_ec_csa', 'eic_mb_csa', 'eic_polarity', 'eic_ec_ok', 'eic_mb_ok', ...FIX.INSPECTIONS.map((_, i) => E.INSPECTION_KEY(i))];
eq('a fresh draft has no eic_ answers', Object.keys(fresh.values).filter((k) => k.startsWith('eic_')), []);
eq('no reading or inspection is offered (no suggestion on any of them)', MEASURED.filter((k) => fieldOf(k)?.suggest?.(fresh) || fieldOf(k)?.suggest?.(c0)), []);
eq('every board and circuit reading is marked a test', [...M.BOARD, ...M.TESTS].filter((p) => ['zdb', 'ipf', 'pol', 'phase', 'spd_ok', 'r1', 'rn', 'r2', 'r12', 'r2only', 'ir_v', 'ir_ll', 'ir_le', 'zs', 'rcd_ms', 'rcd_btn', 'afdd_btn'].includes(p.k)).every((p) => p.test), true);
eq('Duplicate copies details only, never a reading', M.COPIED.filter((k) => M.TESTS.some((p) => p.k === k) || M.BOARD.some((p) => p.test && p.k === k)), []);
eq('suggested circuits are descriptions only', M.suggestionsFor(['solar', 'battery', 'ev'], [{ id: 'b1', o: 1 }], []).map((s) => Object.keys(s).sort().join(',')), ['desc,product,sug', 'desc,product,sug', 'desc,product,sug']);
eq('and go once added or turned down', M.suggestionsFor(['solar', 'battery'], [{ id: 'b1', o: 1, skip: ['battery'] }], [{ id: 'x', board: 'b1', o: 1, sug: 'solar' }]).length, 0);
eq('what is offered: the client, the address and the person signing (from the job)', ['eic_client', 'eic_client_addr', 'eic_sig_name', 'eic_sig_tel'].map((k) => fieldOf(k).suggest(fresh)?.src), ['job', 'job', 'job', 'job']);
eq('the route is offered from the office’s choice', fieldOf('eic_route').suggest(fresh), { v: 'eic', src: 'job', text: 'Electrical Installation Certificate (what the office chose)' });
eq('max Zs is typed until the Chapter 41 table is verified', [M.zsTableReady(), M.zsLimit({ ocpd_bs: '60898-1', ocpd_type: 'B', ocpd_a: 32 })], [false, null]);

/* ── Routes (D16) ────────────────────────────────────────────────────────── */

const shownKeys = (c) => form.steps.filter((s) => R.stepShown(s, c)).flatMap((s) => R.visibleFields(s, c).map((f) => f.key));
const single = ctxOf({ ...ans, eic_route: a('eic_single') }, { photos: { eic_sig_one: 1 } });
eq('single signature: one signature and the next inspection', ['eic_sig_one', 'eic_next', 'eic_next_unit', 'eic_sig_con', 'eic_sig_ins'].map((k) => shownKeys(single).includes(k)), [true, true, true, false, false]);
eq('single signature: the next inspection is the electrician’s to give', E.certMissing(single).map((m) => m.key), ['eic_route_why', 'eic_next', 'eic_next_unit']);
eq('a route changed from the office’s needs a reason, and is flagged', [R.flagsFor(form, single).some((f) => f.code === 'EIC_ROUTE' && f.severity === 'review'), E.certMissing(ctxOf({ ...ans, eic_route: a('eic_single'), eic_route_why: a('I designed it'), eic_next: a(10), eic_next_unit: a('years') }, { photos: { eic_sig_one: 1 } }))], [true, []]);
const mw = ctxOf({ ...ans, eic_route: a('meiwc'), eic_route_why: a('One existing circuit') }, { photos: { eic_sig_one: 1 } });
eq('Minor Works: no origin, inspections or supply readings; what was done per circuit, fault protection, the existing installation', [
  ['eic_means', 'eic_i1', 'eic_ipf', 'eic_desc'].some((k) => shownKeys(mw).includes(k)),
  ['eic_mw_fp', 'eic_cmt', 'eic_sig_one', 'eic_earthing'].every((k) => shownKeys(mw).includes(k)),
], [false, true]);
eq('Minor Works: what was done on each circuit, and the method of fault protection', E.certMissing(mw).map((m) => (m.key === 'eic_mw_fp' ? m.key : m.why)), ['What was done on this circuit', 'What was done on this circuit', 'What was done on this circuit', 'eic_mw_fp']);
eq('Minor Works: one certificate per circuit, numbered from the EIC reference', W.meiwcList(mw).map((m) => m.ref), ['HX-0042-MW1', 'HX-0042-MW2', 'HX-0042-MW3']);
eq('a second electrician’s Minor Works', [W.meiwcRef('HX-0042-EIC2', 0), W.meiwcRef(null, 0)], ['HX-0042-MW2.1', null]);
const own = ctxOf({ ...ans, eic_route: a('own'), eic_route_why: a('NAPIT') });
eq('their own certificate: only the choice is asked here', form.steps.filter((s) => R.stepShown(s, own)).map((s) => s.key), ['eic-cert']);
eq('and it isn’t complete in the app (their upload is)', E.certComplete(own), false);
eq('the route falls back to the office’s until chosen', M.routeOf(ctxOf({}, { eic: { ...FACTS, route: 'meiwc' } })), 'meiwc');

/* ── Flags ───────────────────────────────────────────────────────────────── */

const codes = (c) => R.flagsFor(form, c).map((f) => `${f.code}:${f.severity}`);
eq('the full fixture raises nothing', codes(c0), []);
eq('an inspection ✗ stops the sign-off', codes(ctxOf({ ...ans, eic_i3: a('problem') })), ['EIC_I3:stop']);
eq('14.0 N/A on a PV job: for the office', codes(ctxOf({ ...ans, eic_i14: a('na') })), ['EIC_NA_14:review']);
const zsHigh = ctxOf({ ...ans, 'eic_db:c-c3': a({ ...ans['eic_db:c-c3'].v, zs: 2.4 }) });
eq('measured Zs over the maximum stops it, naming the circuit', R.flagsFor(form, zsHigh).map((f) => [f.code, f.severity, f.text]), [['EIC_ZS', 'stop', 'Measured Zs is over the maximum permitted on DB1 circuit 9 (Sockets: garage). Put it right, or check the figures.']]);
eq('a low insulation reading: for the office while Table 64 is unverified', codes(ctxOf({ ...ans, 'eic_db:c-c1': a({ ...ans['eic_db:c-c1'].v, ir_le: 0.4 }) })), ['EIC_IR:review']);
eq('">999" is never low', M.irLow([{ id: 'b1', o: 1, ref: 'DB1' }], [{ id: 'x', board: 'b1', o: 1, ir_v: 500, ir_ll: '>999', ir_le: '>0.5' }]), []);
eq('an RCD test button that fails stops it', codes(ctxOf({ ...ans, 'eic_db:c-c1': a({ ...ans['eic_db:c-c1'].v, rcd_btn: 'fail' }) })), ['EIC_RCD_BTN:stop']);
eq('no gas bonding, maximum demand over the fuse: for the office', codes(ctxOf({ ...ans, eic_b_gas: a('no'), eic_md: a(120) })), ['EIC_BOND_gas:review', 'EIC_DEMAND:review']);

/* ── The PDF ─────────────────────────────────────────────────────────────── */

const PNG = scribble();
const sig = { png: PNG, at: '2026-11-03T16:20:00Z' };
const design = { name: 'Sarah Jones', company: 'Heliaxis Ltd', address: '9 Turner Street, Newport, Gwent', postcode: 'NP19 7AZ', tel: '01633 965205', next_n: 10, next_unit: 'years', departures: null, signed_at: '2026-11-04T09:10:00Z', path: 'x.png', by: null, png: PNG };
const base = { route: 'eic', ref: 'HX-0042-EIC', jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: c0.values, address: c0.address, sig: { con: sig, ins: sig }, design, draft: false };
const bytes = await eicPdf(base);
keep('EIC-final.pdf', bytes);
const pages = await pagesOf(bytes);
const portrait = pages.filter((p) => p.w < p.h);
const landscape = pages.filter((p) => p.w > p.h);
eq('certificate pages portrait, then landscape schedules (circuit details, test results)', [portrait.length >= 2, landscape.length, pages.findIndex((p) => p.w > p.h) === portrait.length], [true, 2, true]);
const all = pages.map((p) => p.text).join('\n');
eq('sections A–J in order', ['A. DETAILS OF THE CLIENT', 'B. INSTALLATION DETAILS', 'C. DECLARATIONS', 'D. NEXT INSPECTION', 'E. PARTICULARS OF SIGNATORIES', 'F. SUPPLY CHARACTERISTICS', 'G. PARTICULARS OF INSTALLATION', 'H. SCHEDULE OF INSPECTIONS', 'I. COMMENTS ON EXISTING', 'J. SCHEDULES'].map((h) => all.indexOf(h)).every((x, i, arr) => x >= 0 && (i === 0 || x > arr[i - 1])), true);
const colNums = (t, from, to) => {
  let at = 0;
  for (let n = from; n <= to; n++) {
    const i = t.indexOf(` ${n} `, at);
    if (i < 0) return n;
    at = i + 1;
  }
  return 'all';
};
eq('circuit details page: columns 1–16 in order', colNums(` ${landscape[0].text} `, 1, 16), 'all');
eq('test results page: columns 17–31 in order', colNums(` ${landscape[1].text} `, 17, 31), 'all');
eq('three declarations, the design one signed', [all.split('hereby CERTIFY').length - 1, all.includes('Designer No. 1'), all.includes('SARAH JONES'), all.includes('Constructor'), all.includes('Inspector')], [3, true, true, true, true]);
eq('the edition and the next inspection', [all.includes('BS 7671:2018 amended to 2026 (A4)'), all.includes('not more than 10 years')], [true, true]);
eq('readings print as given (>999, Ω, MΩ, mm²)', ['>999', 'Ω', 'mm²', 'IΔn'].every((x) => all.includes(x)), true);
eq('no "?" stands in for a symbol, no "Not answered", no draft banner', [/\?/.test(all), all.includes('Not answered'), all.includes('Draft: not signed yet')], [false, false, false]);
eq('the footer on every page', pages.every((p, i) => p.text.includes(`EIC · Rev 1 · Page ${i + 1} of ${pages.length}`)), true);
eq('guidance for recipients to follow (unverified), no IET logo text', [all.includes('Guidance for recipients to follow'), /IET\s+logo/i.test(all)], [true, false]);

// A board with 40 circuits: the schedules run over pages, headings and column numbers on each.
const many = { ...ans };
for (let i = 0; i < 40; i++) many[`eic_db:c-m${i}`] = a({ ...details(20 + i, `Circuit ${20 + i}`), ...tests, o: 20 + i });
const longPages = await pagesOf(await eicPdf({ ...base, values: ctxOf(many).values }));
const sched = longPages.filter((p) => p.w > p.h);
eq('long schedules run onto more landscape pages', sched.length >= 4, true);
eq('their headings repeat (circuit details)', sched.filter((p) => p.text.includes('Circuit description')).every((p) => colNums(` ${p.text} `, 1, 16) === 'all'), true);
eq('their headings repeat (test results)', sched.filter((p) => p.text.includes('Maximum measured Zs')).every((p) => colNums(` ${p.text} `, 17, 31) === 'all') && sched.filter((p) => p.text.includes('Maximum measured Zs')).length >= 2, true);

// A draft: the design part not signed yet.
const draftBytes = await eicPdf({ ...base, design: null, draft: true });
keep('EIC-draft.pdf', draftBytes);
const dtext = (await pagesOf(draftBytes)).map((p) => p.text).join('\n');
eq('until the office signs, a draft: design "Not signed yet"', [dtext.includes('Draft: not signed yet'), dtext.includes('Not signed yet'), dtext.includes('To follow: Heliaxis signs the design part')], [true, true, true]);
let threw = null;
try {
  await eicPdf({ ...base, design: null, draft: false });
} catch (e) {
  threw = e instanceof K.MissingAnswer ? 'missing' : String(e);
}
eq('a finished EIC can’t be made without the design part', threw, 'missing');
threw = null;
try {
  await eicPdf({ ...base, values: ctxOf(without(ans, 'eic_ze')).values });
} catch (e) {
  threw = e instanceof K.MissingAnswer ? e.label : String(e);
}
eq('nor with a reading missing', threw, 'External earth fault loop impedance, Ze (2)');

// Single signature: one block, one signature; with the single form's wording once copied in, one declaration.
const singleBytes = await eicPdf({ ...base, route: 'eic_single', values: { ...c0.values, eic_route: 'eic_single', eic_next: 10, eic_next_unit: 'years' }, sig: { one: sig }, design: null });
keep('EIC-single.pdf', singleBytes);
const stext = (await pagesOf(singleBytes)).map((p) => p.text).join('\n');
eq('single signature: one signatory, no designer line', [stext.includes('Designer, constructor and inspector'), stext.includes('Designer No. 1'), stext.includes('(single signature)')], [true, false, true]);
const oneDecl = (await pagesOf(await eicPdf({ ...base, route: 'eic_single', values: { ...c0.values, eic_next: 5, eic_next_unit: 'years' }, sig: { one: sig }, design: null, wording: { single: (x) => `TEST WORDING: one declaration, BS 7671:2018 amended to ${x}, hereby CERTIFY.` } }))).map((p) => p.text).join('\n');
eq('with the single-signature wording verified: exactly one declaration', [oneDecl.split('hereby CERTIFY').length - 1, oneDecl.includes('TEST WORDING')], [1, true]);

// Minor Works: one sheet per circuit; a data sheet until its wording is verified.
const mwList = W.meiwcList(mw);
const mwBytes = await meiwcPdf({ ref: mwList[0].ref, jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: { ...mw.values, eic_mw_fp: 'ADS (automatic disconnection of supply)' }, address: mw.address, circuit: { ...mwList[0].circuit, work: 'Added a socket' }, name: mwList[0].name, sig, draft: false });
keep('MEIWC-1.pdf', mwBytes);
const mtext = (await pagesOf(mwBytes)).map((p) => p.text).join('\n');
eq('Minor Works: a data sheet while unverified, titled so, for this circuit', [mtext.includes('Minor Works data sheet'), mtext.includes('It isn’t the certificate'), mtext.includes('DB1 circuit 7'), mtext.includes('Added a socket')], [true, true, true, true]);
const mwCert = (await pagesOf(await meiwcPdf({ ref: 'HX-0042-MW1', jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: { ...mw.values, eic_mw_fp: 'ADS' }, address: mw.address, circuit: { ...mwList[0].circuit, work: 'Added a socket' }, name: mwList[0].name, sig, draft: false, wording: { verified: true, declaration: (x) => `TEST MW WORDING to ${x}` } }))).map((p) => p.text).join('\n');
eq('once verified: the certificate with its declaration', [mwCert.includes('Minor Electrical Installation Works Certificate'), mwCert.includes('TEST MW WORDING to 2026 (A4)'), mwCert.includes('data sheet')], [true, true, false]);

/* ── For the rest of the pack ────────────────────────────────────────────── */

const sum = E.eicSummary(ctxOf({ ...ans, eic_design: a({ ...design, png: undefined }) }));
eq('F74 Part 2 and F78 read the EIC: reference, schedules, circuits, next inspection', [sum.refs, sum.circuits.length, sum.next, sum.complete], ['HX-0042-EIC: Schedule of inspections, Schedules of circuit details and test results', 3, '10 years', true]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
