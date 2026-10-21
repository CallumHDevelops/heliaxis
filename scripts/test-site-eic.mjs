// The electrician's certificate (SPEC 3, REGS 1.2–1.5): src/lib/site/forms/electrician/{eic,eic-model,meiwc}.ts
// and the PDFs in src/lib/documents/eic/. Every field the model form has is asked for (checked against
// REGS 1.2's lists, copied below), the gate (a board, three circuits, instruments, signatures passes;
// any reading taken out reopens it with the circuit named), nothing measured is ever filled in, the
// routes (three-part, single signature, Minor Works, their own), the flags, max Zs worked out from first
// principles, and the PDF against the IET's BS 7671:2018+A4:2026 model form: Sections A–J in order on
// two portrait pages, the declarations and the other fixed words as the form prints them (its text
// layer, copied below), the Generic Schedules with columns 1–31 and their headings, 12 rows a sheet,
// the codes table and the footnotes word for word, the continuation sheets, the notes and the guidance
// for recipients, and the certificate number on every page.
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
const { eicPdf, ROWS } = await import('../src/lib/documents/eic/eic.ts');
const ZS = await import('../src/lib/site/fixed/bs7671-zs.ts');
const { IET_GUIDANCE } = await import('../src/lib/site/fixed/iet-guidance.ts');
const { plain } = await import('../src/lib/documents/eic/form.ts');
const { meiwcPdf } = await import('../src/lib/documents/eic/meiwc.ts');
const K = await import('../src/lib/documents/pdf-kit.ts');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const fs = await import('node:fs');
const { a, details, tests, full: fullOf, FACTS, scribble, ZS_SRC } = await import('./site-eic-fixture.mjs');

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
  'Supply protective device: BS (EN), type, rated current, breaking capacity': ['eic_sup_bs', 'eic_sup_type', 'eic_sup_a', 'eic_sup_ka'],
  'Means of earthing': ['eic_means'],
  'Maximum demand, kVA / A': ['eic_md', 'eic_md_unit'],
  'Installation earth electrode: type, location, resistance/impedance RA/Ze': ['eic_rod_type', 'eic_rod_loc', 'eic_ra', 'eic_ra_kind'],
  'Earthing conductor: material (what it is, if other), csa, verified': ['eic_ec_mat', 'eic_ec_mat_other', 'eic_ec_csa', 'eic_ec_ok'],
  'Main protective bonding conductors: material (what it is, if other), csa, verified': ['eic_mb_mat', 'eic_mb_mat_other', 'eic_mb_csa', 'eic_mb_ok'],
  'Bonding: water, gas, oil, structural steel, lightning protection, other (specify)': ['eic_b_water', 'eic_b_gas', 'eic_b_oil', 'eic_b_steel', 'eic_b_lightning', 'eic_b_other', 'eic_b_other_what'],
  'Main switch: location, BS (EN), poles, current rating, voltage rating': ['eic_ms_loc', 'eic_ms_bs', 'eic_ms_poles', 'eic_ms_a', 'eic_ms_v'],
  'If overcurrent protective device: device type, rating/setting, breaking capacity, settings attached': ['eic_ms_ocpd', 'eic_ms_dev', 'eic_ms_dev_other', 'eic_ms_set', 'eic_ms_ka', 'eic_ms_settings'],
  'If RCD main switch: type, IΔn, rated time delay, measured operating time, breaking capacity': ['eic_ms_rcd', 'eic_ms_rcd_type', 'eic_ms_idn', 'eic_ms_delay', 'eic_ms_time', 'eic_ms_rcd_ka'],
  'Schedule of inspections (14 lines)': FIX.INSPECTIONS.map((_, i) => E.INSPECTION_KEY(i)),
  'Comments on existing installation (Reg 644.1.2)': ['eic_cmt', 'eic_cmt_more'],
  'Schedules of circuit details and test results': ['eic_db'],
  'Test instruments': ['eic_inst'],
};
const homeless = Object.entries(REGS_PAGE).flatMap(([what, ks]) => ks.filter((k) => !keysOf.has(k)).map((k) => `${what}: ${k}`));
eq('every blank on the A4 form’s two pages is asked', homeless, []);
eq('earthing in the form’s order', E.EARTHING.map((o) => o.label), ['TN-C', 'TN-S', 'TN-C-S (PME)', 'TN-C-S (PNB)', 'TT', 'IT']);
eq('main switch RCD types: AC, A, F, B (no S: a time delay is its own blank)', fieldOf('eic_ms_rcd_type').picks, ['AC', 'A', 'F', 'B']);
eq('main switch device types: MCCB, ACB, Fuse(s), other', E.MS_DEVICE.map((o) => o.key), ['MCCB', 'ACB', 'Fuse(s)', 'other']);
eq('the form’s words as the labels (a few)', ['eic_earthing', 'eic_live', 'eic_polarity', 'eic_desc', 'eic_extent', 'eic_ra'].map((k) => fieldOf(k).label), [
  'Earthing arrangements',
  'Number and type of live conductors',
  'Confirmation of supply polarity',
  'Description of installation',
  'Extent of installation covered by this Certificate',
  'Electrode resistance/impedance, RA/Ze',
]);
eq('each step says where it is on the certificate', E.EIC_STEPS.filter((st) => st.key !== 'eic-cert').every((st) => /Section|Schedule|Details of test instruments/.test(st.intro ?? '')), true);
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
eq('board: reference, location, supplied from, distribution OCPD, SPD type, the board’s RCD, Zdb, Ipf, polarity, phase sequence, SPD status', M.BOARD.map((p) => p.k), ['ref', 'loc', 'from', 'ocpd_bs', 'ocpd_type', 'ocpd_a', 'spd', 'rcd', 'rcd_bs', 'rcd_type', 'rcd_a', 'rcd_idn', 'zdb', 'ipf', 'pol', 'phase', 'spd_ok']);
eq('SPD types T1, T2, T3, N/A', M.BOARD.find((p) => p.k === 'spd').options.map((o) => o.key), ['T1', 'T2', 'T3', 'na']);
eq('test instruments: the six on the form', M.INSTRUMENTS.map((i) => i.k), ['mft', 'cont', 'ir', 'efli', 'rcd', 'earth']);
eq('wiring codes A–H and O, as the form’s key has them', FIX.WIRING_CODES.map((w) => `${w.code} ${w.label}`), [
  'A Thermoplastic insulated/sheathed cables',
  'B Thermoplastic cables in metallic conduit',
  'C Thermoplastic cables in non-metallic conduit',
  'D Thermoplastic cables in metallic trunking',
  'E Thermoplastic cables in non-metallic trunking',
  'F Thermoplastic SWA cables',
  'G Thermosetting SWA cables',
  'H Mineral insulated cables',
  'O Other - please state',
]);
eq('declarations: design, construction, inspection; the edition filled in', ['design', 'construction', 'inspection'].map((k) => FIX.DECLARATION[k]('2026 (A4)').includes('BS 7671:2018, amended to 2026 (A4) (date)')), [true, true, true]);
eq('edition words', [FIX.editionWords('A4:2026'), FIX.editionWords('A2:2022+A3:2024'), FIX.editionWords(null)], ['2026 (A4)', '2024 (A3)', '2026 (A4)']);

/* ── The gate ─────────────────────────────────────────────────────────────── */

const full = () => fullOf(FIX.INSPECTIONS, E.INSPECTION_KEY);
const ans = full();
const c0 = ctxOf(ans);
eq('a board, three circuits, instruments and both signatures: nothing missing', E.certMissing(c0), []);
eq('and the certificate is complete', E.certComplete(c0), true);
const form = F.schemaFor({ trade: 'electrician', forms: F.formsFor(['solar', 'battery']) })[0];
const EIC_KEYS = ['eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign'];
eq('the electrician’s pack holds the certificate, at its place (after the system summary, before their own upload and Finish)', [form.stage, form.steps.map((s) => s.key).slice(form.steps.findIndex((s) => s.key === 'summary') + 1)], ['main', [...EIC_KEYS, 'cert-own', 'cert', 'finish']]);
eq('so the sign-off gate has nothing left from the certificate', R.signCheck(form, c0).must.filter((m) => m.step.startsWith('eic-')), []);
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
eq('e.g. Zs gone from circuit 8', E.certMissing(ctxOf(without(ans, 'eic_db:c-c2', 'zs'))).map((m) => [m.label, m.why]), [['DB1 circuit 8 (Battery inverter supply): test results', 'Zs: maximum measured']]);
eq('a board with no circuits', E.certMissing(ctxOf({ ...ans, 'eic_db:b-b2': a({ o: 2, ref: 'DB2', loc: 'Garage', from: 'DB1', spd: ['na'], rcd: 'no', zdb: 0.4, ipf: 1.1, pol: true }) })).map((m) => m.label), ['DB2: circuits']);
eq('no boards at all', E.certMissing(ctxOf(Object.fromEntries(Object.entries(ans).filter(([k]) => !k.startsWith('eic_db:'))))).some((m) => m.label.includes('consumer unit')), true);
eq('instruments: none', E.certMissing(ctxOf(without(ans, 'eic_inst'))).map((m) => m.why), ['The multifunction tester (or each tester you used)']);
eq('instruments: single testers instead of a multifunction tester', E.certMissing(ctxOf({ ...ans, eic_inst: a({ cont: 'A', ir: 'B', efli: 'C' }) })).map((m) => m.why), ['RCD']);
eq('a signature missing', E.certMissing(ctxOf(ans, { photos: { eic_sig_con: 1 } })).map((m) => m.label), ['Sign for the inspection and testing']);
eq('the design part and next inspection aren’t the electrician’s (three-part)', E.certMissing(c0).some((m) => /design|next/i.test(m.label)), false);
eq('the board’s readings count too', E.certMissing(ctxOf(without(ans, 'eic_db:b-b1', 'zdb'))).map((m) => [m.label, m.why]), [['DB1: board details', 'Zdb']]);
eq('a TT supply asks for the electrode, its RA/Ze and which it is', E.certMissing(ctxOf({ ...ans, eic_earthing: a('tt') })).map((m) => m.key).sort(), ['eic_ra', 'eic_ra_kind', 'eic_rod_loc', 'eic_rod_type']);
eq('three-phase asks U and the board’s phase sequence', E.certMissing(ctxOf({ ...ans, eic_live: a('ac_3p4w') })).map((m) => m.key + (m.why ? `:${m.why}` : '')), ['eic_u:Not answered', 'eic_db:Confirmed: phase sequence']);
// The A4 form's new blanks are asked, and only where the form has them.
const newMusts = E.certMissing(ctxOf(Object.fromEntries(Object.entries(ans).filter(([k]) => !['eic_sup_ka', 'eic_md_unit', 'eic_ms_ocpd'].includes(k))))).map((m) => m.key);
eq('the supply fuse’s breaking capacity, kVA or A, and whether the main switch is an overcurrent device are musts', newMusts, ['eic_sup_ka', 'eic_md_unit', 'eic_ms_ocpd']);
// The electrician's pack holds the certificate's screens, so its own sign-off gate asks them too, on their steps.
const packNew = R.signCheck(form, ctxOf(Object.fromEntries(Object.entries(ans).filter(([k]) => !['eic_sup_ka', 'eic_md_unit', 'eic_ms_ocpd'].includes(k))))).must.filter((m) => m.step.startsWith('eic-'));
eq('…and the pack’s sign-off gate stops on them, on the certificate’s steps', packNew.map((m) => `${m.step}:${m.key}`), ['eic-supply:eic_sup_ka', 'eic-origin:eic_md_unit', 'eic-origin:eic_ms_ocpd']);
eq('a main switch that’s an overcurrent device: its type, rating/setting and breaking capacity', E.certMissing(ctxOf({ ...ans, eic_ms_ocpd: a('yes') })).map((m) => m.key), ['eic_ms_dev', 'eic_ms_set', 'eic_ms_ka']);
eq('…“other”: what it is; the settings photo is optional', [E.certMissing(ctxOf({ ...ans, eic_ms_ocpd: a('yes'), eic_ms_dev: a('other'), eic_ms_set: a(100), eic_ms_ka: a(25) })).map((m) => m.key), fieldOf('eic_ms_settings').level], [['eic_ms_dev_other'], 'optional']);
eq('an RCD main switch: its breaking capacity too', E.certMissing(ctxOf({ ...ans, eic_ms_rcd: a('yes'), eic_ms_rcd_type: a('A'), eic_ms_idn: a(100), eic_ms_time: a(40) })).map((m) => m.key), ['eic_ms_rcd_ka']);
eq('a board fed through an RCD: its BS (EN), type, rating and IΔn', E.certMissing(ctxOf({ ...ans, 'eic_db:b-b1': a({ ...ans['eic_db:b-b1'].v, rcd: 'yes' }) })).map((m) => m.why), ['Board RCD: BS (EN), Board RCD: type, Board RCD: rating, Board RCD: rated residual operating current (IΔn)']);
eq('“T3 SPD: what does it protect?” only on a board with a T3', [M.shownProps(M.DETAILS, ans['eic_db:c-c1'].v, pc).some((q) => q.k === 'spd_t3'), M.shownProps(M.DETAILS, ans['eic_db:c-c1'].v, M.propCtx(ctxOf({ ...ans, 'eic_db:b-b1': a({ ...ans['eic_db:b-b1'].v, spd: ['T2', 'T3'] }) }))).some((q) => q.k === 'spd_t3')], [false, true]);
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
// U0 × Cmin ÷ Ia, U0 230 V, Cmin 0.95, Ia 5/10/20 × In for type B/C/D.
const calc = (type, ratingA, extra = {}, tt = false) => ZS.zsCalculated({ ocpd_type: type, ocpd_a: ratingA, ...extra }, { tt })?.ohms ?? null;
eq('max Zs worked out: B32 → 1.37 Ω, C32 → 0.68 Ω, B6 → 7.28 Ω', [calc('B', 32), calc('C', 32), calc('B', 6)], [1.37, 0.68, 7.28]);
eq('…B20 → 2.19 Ω (2.185 rounds up), D16 → 0.68 Ω, B40 → 1.09 Ω', [calc('B', 20), calc('D', 16), calc('B', 40)], [2.19, 0.68, 1.09]);
eq('…a fuse isn’t worked out (typed from the tables)', [calc('gG', 32), calc(undefined, 32), calc('B', undefined)], [null, null, null]);
eq('…a TT supply with the circuit’s RCD giving fault protection: 50 V ÷ IΔn (Reg 411.5)', [calc('B', 32, { rcd: 'yes', rcd_idn: 30 }, true), calc('B', 32, { rcd: 'yes', rcd_idn: 30 }, false), calc('B', 32, { rcd: 'no' }, true)], [1667, 1.37, 1.37]);
const zsProp = M.DETAILS.find((q) => q.k === 'zs_max');
const offered = zsProp.suggest({ ocpd_type: 'B', ocpd_a: 32 }, pc);
eq('it’s offered as a suggestion, its source for Remarks (footnote §) going with it; never filled in', [offered.v, offered.also.zs_src, ZS.isCalculatedSource(offered.also.zs_src), Object.keys(ans['eic_db:c-c1'].v).includes('zs_max')], [1.37, ZS_SRC.B32, true, true]);
eq('the fixture’s sources are the calculation’s own words', [ZS.zsCalculated({ ocpd_type: 'B', ocpd_a: 32 }).source, ZS.zsCalculated({ ocpd_type: 'B', ocpd_a: 20 }).source], [ZS_SRC.B32, ZS_SRC.B20]);
eq('nothing is offered for a fuse', zsProp.suggest({ ocpd_type: 'gG', ocpd_a: 32 }, pc), null);

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
eq('their own certificate: only the choice is asked here, then their upload', form.steps.filter((s) => R.stepShown(s, own) && /^(eic-|cert)/.test(s.key)).map((s) => s.key), ['eic-cert', 'cert-own']);
eq('and it isn’t complete in the app (their upload is)', E.certComplete(own), false);
eq('the route falls back to the office’s until chosen', M.routeOf(ctxOf({}, { eic: { ...FACTS, route: 'meiwc' } })), 'meiwc');

/* ── Flags ───────────────────────────────────────────────────────────────── */

// The certificate's own flags (the rest of the pack has its own tests: test-site-electrician.mjs).
const eicFlags = (c) => R.flagsFor(form, c).filter((f) => f.code.startsWith('EIC'));
const codes = (c) => eicFlags(c).map((f) => `${f.code}:${f.severity}`);
eq('the full fixture raises nothing', codes(c0), []);
eq('an inspection ✗ stops the sign-off', codes(ctxOf({ ...ans, eic_i3: a('problem') })), ['EIC_I3:stop']);
eq('14.0 N/A on a PV job: for the office', codes(ctxOf({ ...ans, eic_i14: a('na') })), ['EIC_NA_14:review']);
const zsHigh = ctxOf({ ...ans, 'eic_db:c-c3': a({ ...ans['eic_db:c-c3'].v, zs: 2.4 }) });
eq('measured Zs over the maximum stops it, naming the circuit', eicFlags(zsHigh).map((f) => [f.code, f.severity, f.text]), [['EIC_ZS', 'stop', 'Measured Zs is over the maximum permitted on DB1 circuit 9 (Sockets: garage). Put it right, or check the figures.']]);
eq('a low insulation reading: for the office while Table 64 is unverified', codes(ctxOf({ ...ans, 'eic_db:c-c1': a({ ...ans['eic_db:c-c1'].v, ir_le: 0.4 }) })), ['EIC_IR:review']);
eq('">999" is never low', M.irLow([{ id: 'b1', o: 1, ref: 'DB1' }], [{ id: 'x', board: 'b1', o: 1, ir_v: 500, ir_ll: '>999', ir_le: '>0.5' }]), []);
eq('an RCD test button that fails stops it', codes(ctxOf({ ...ans, 'eic_db:c-c1': a({ ...ans['eic_db:c-c1'].v, rcd_btn: 'fail' }) })), ['EIC_RCD_BTN:stop']);
eq('no gas bonding, maximum demand over the fuse: for the office', codes(ctxOf({ ...ans, eic_b_gas: a('no'), eic_md: a(120) })), ['EIC_BOND_gas:review', 'EIC_DEMAND:review']);
eq('a demand in kVA isn’t compared with the fuse in amps', codes(ctxOf({ ...ans, eic_md: a(120), eic_md_unit: a('kVA') })), []);
eq('a supply fuse whose breaking capacity is under the Ipf: for the office', codes(ctxOf({ ...ans, eic_sup_ka: a(1.5) })), ['EIC_SUP_KA:review']);

/* ── The PDF ─────────────────────────────────────────────────────────────── */

/* The IET's own words, copied from the A4:2026 form's text layer (bs7671_eic_a4.pdf, pages 2–5; its
   kerning slip "BS 7 671" and its dotted blanks as they are). Matched with spaces taken out. */
const IET_DECLARATIONS = {
  design: `I/We, being the person(s) responsible for the design of the electrical installation (as indicated by my/our signatures below), particulars of which are
described above, having exercised reasonable skill and care when carrying out the design, hereby CERTIFY
that the design work for which I/we have been responsible is to the best of my/our knowledge and belief in accordance with BS 7 671:2018,
amended to ........... (date) except for the departures, if any, detailed as follows:`,
  construction: `I, being the person responsible for the construction of the electrical installation (as indicated by my signature below), particulars of
which are described above, having exercised reasonable skill and care when carrying out the construction hereby CERTIFY that the
construction work for which I have been responsible is to the best of my knowledge and belief in accordance with BS 7671:2018,
amended to.........(date) except for the departures, if any, detailed as follows:`,
  inspection: `I, being the person responsible for the inspection & testing of the electrical installation (as indicated by my signature below), particulars
of which are described above, having exercised reasonable skill and care when carrying out the inspection & testing hereby CERTIFY
that the work for which I have been responsible is to the best of my knowledge and belief in accordance with
BS 7671:2018, amended to..........(date) except for the departures, if any, detailed as follows:`,
};
const IET_TEXT = [
  'ELECTRICAL INSTALLATION CERTIFICATE',
  '(See the guidance for recipients included with this certificate)',
  'DESCRIPTION AND EXTENT OF THE INSTALLATION',
  'Description of installation:',
  'Extent of installation covered by this Certificate:',
  '(Use continuation sheet if necessary)',
  'See continuation sheet No.:',
  'Details of permitted exceptions (Regulation 411.3.3). Where applicable, a suitable risk assessment(s) must be attached to this Certificate.',
  'Risk assessment attached',
  'For the DESIGN of the installation: **(Where there is mutual responsibility for the design)',
  'For CONSTRUCTION of the installation:',
  'For INSPECTION AND TESTING of the installation:',
  'I/We, the designer(s), recommend that this installation is further inspected and tested after an interval of not more than',
  'Number and Type of Live Conductors',
  'Nature of Supply Parameters',
  'Supply Protective Device',
  '(Note: (1) by enquiry (2) by enquiry or by measurement)',
  'Other sources of supply (as detailed on attached continuation sheet)',
  'Details of Installation Earth Electrode (where applicable)',
  'Main switch (Isolation device / Switch-fuse / Circuit-breaker / RCD etc.)',
  'If overcurrent protective device',
  'Device type MCCB / ACB / Fuse(s) / other',
  'Attach protective device settings where applicable on separate continuation sheet(s).',
  'If RCD main switch',
  'RCD Type AC / A / F / B / other',
  'kVA / A (Delete as appropriate)',
  'Prosumer’s low voltage electrical installation(s)',
  'SECTION I: COMMENTS ON EXISTING INSTALLATION (in the case of an addition or alteration see Regulation 644.1.2):',
  'Schedule(s) of Circuit Details and Schedule(s) of Test Results',
  'The schedule(s) and continuation sheet(s) listed are part of this document and this certificate is valid only when they are attached to it.',
  'Distribution board/Consumer unit details',
  'Distribution circuit OCPD: BS (EN):',
  'SPD Details: Type(s)*:',
  'CODES FOR TYPES OF WIRING',
  'Details of test instruments used (serial and/or asset numbers)',
  'Include details of circuits, and/or installed equipment vulnerable to damage when testing',
  '(continue on additional page(s) if necessary)',
  'Tested by name (Capitals):',
];
const squash = (t) => t.replace(/\s+/g, '');
const fill = (t) => t.replace(/\s*\.{3,}\s*\(date\)/, ' 2026 (A4) (date)');
eq('the declarations are the form’s, word for word', ['design', 'construction', 'inspection'].map((k) => squash(FIX.DECLARATION[k]('2026 (A4)')) === squash(fill(IET_DECLARATIONS[k]))), [true, true, true]);
eq('so are the departures, liability and exceptions lines', [FIX.DEPARTURES, FIX.LIABILITY, FIX.EXCEPTIONS], [
  'Details of departures from BS 7671 (Regulations 120.3, 133.1.2, 133.1.3 and 133.5):',
  'The extent of liability of the signatory or signatories is limited to the work described above as the subject of this Certificate.',
  'Details of permitted exceptions (Regulation 411.3.3). Where applicable, a suitable risk assessment(s) must be attached to this Certificate.',
]);
eq('no single-signature declaration of our own (the form has none: Note 3)', Object.keys(FIX.DECLARATION), ['design', 'construction', 'inspection']);
eq('the guidance for recipients is the A4 page’s, and verified', [IET_GUIDANCE.issue, IET_GUIDANCE.verified, IET_GUIDANCE.paragraphs.length, IET_GUIDANCE.paragraphs[3].endsWith('is stated in Section D.')], ['A4:2026', true, 10, true]);

const PNG = scribble();
const sig = { png: PNG, at: '2026-11-03T16:20:00Z' };
const design = { name: 'Sarah Jones', company: 'Heliaxis Ltd', address: '9 Turner Street, Newport, Gwent', postcode: 'NP19 7AZ', tel: '01633 965205', next_n: 10, next_unit: 'years', departures: null, signed_at: '2026-11-04T09:10:00Z', path: 'x.png', by: null, png: PNG };
const base = { route: 'eic', ref: 'HX-0042-EIC', jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: c0.values, address: c0.address, sig: { con: sig, ins: sig }, design, draft: false };
const bytes = await eicPdf(base);
keep('EIC-final.pdf', bytes);
const pages = await pagesOf(bytes);
const landscape = pages.filter((p) => p.w > p.h);
const kinds = pages.map((p) => (p.text.includes('SECTION A: DETAILS OF THE CLIENT') ? 'A–D' : p.text.includes('SECTION E: PARTICULARS') ? 'E–J' : p.text.includes('CONTINUATION SHEET') ? 'cont' : p.text.includes('GENERIC SCHEDULE OF CIRCUIT DETAILS') ? 'details' : p.text.includes('GENERIC SCHEDULE OF TEST RESULTS') ? 'tests' : p.text.includes('Notes for the person producing') ? 'notes' : p.text.includes('GUIDANCE FOR RECIPIENTS') ? 'guidance' : '?'));
eq('the pages in the form’s order: A–D, E–J, the continuation sheet (other sources), the two schedules, the notes, the guidance', kinds, ['A–D', 'E–J', 'cont', 'details', 'tests', 'notes', 'guidance']);
eq('certificate pages portrait, the schedules landscape', pages.map((p) => (p.w > p.h ? 'L' : 'P')).join(''), 'PPPLLPP');
const all = pages.map((p) => p.text).join('\n');
const A = squash(all);
const SECTIONS = Object.entries(FIX.SECTION_TITLES).filter(([k]) => k.length === 1).map(([, t]) => t);
eq('Sections A–J with the form’s headings, in order, A–D on page 1 and E–J on page 2', [SECTIONS.map((h) => all.indexOf(h)).every((x, i, arr) => x >= 0 && (i === 0 || x > arr[i - 1])), SECTIONS.slice(0, 4).every((h) => pages[0].text.includes(h)), SECTIONS.slice(4).every((h) => pages[1].text.includes(h))], [true, true, true]);
eq('the three declarations as the form prints them, the edition filled in', Object.values(IET_DECLARATIONS).map((t) => A.includes(squash(fill(t)))), [true, true, true]);
eq('the departures line in all three parts, “signatory or signatories” in all three', [all.split(FIX.DEPARTURES).length - 1, all.split('signatory or signatories').length - 1], [3, 3]);
eq('every other fixed line of the form, word for word', IET_TEXT.filter((t) => !A.includes(squash(t))), []);
eq('the inspection lines with the form’s line breaks', FIX.INSPECTIONS.filter((it) => !A.includes(squash(it.label))), []);
eq('the circuit schedule’s headings (columns 1–16) and groups', [...Object.values(FIX.CIRCUIT_SCHEDULE.heads), ...FIX.CIRCUIT_SCHEDULE.groups.map((g) => g.label)].map(plain).filter((t) => !squash(landscape[0].text).includes(squash(t))), []);
eq('the test schedule’s headings (columns 17–31) and groups', [...Object.values(FIX.TEST_SCHEDULE.heads), ...FIX.TEST_SCHEDULE.groups.map((g) => g.label)].map(plain).filter((t) => !squash(landscape[1].text).includes(squash(t))), []);
eq('the footnotes word for word: * † ‡ § and ¶ # ** ‡‡ ††', [...FIX.CIRCUIT_SCHEDULE.footnotes.map(plain).filter((t) => !squash(landscape[0].text).includes(squash(t))), ...FIX.TEST_SCHEDULE.footnotes.map(plain).filter((t) => !squash(landscape[1].text).includes(squash(t)))], []);
eq('the codes for types of wiring table', [landscape[0].text.includes('CODES FOR TYPES OF WIRING'), FIX.WIRING_CODES.every((w) => squash(landscape[0].text).includes(squash(w.label)))], [true, true]);
eq('“Certificate No.:” on the certificate pages, “Certificate/Report No.:” on the schedules', pages.map((p, i) => p.text.includes(`${p.w > p.h ? 'Certificate/Report No.:' : 'Certificate No.:'} HX-0042-EIC`) || i), pages.map(() => true));
eq('Section J filled in: the continuation sheet for F, Section H as the schedule of inspection, 2 schedules, their pages and the total', [all.includes('1 Continuation sheet(s) for Section(s) F 1 Schedule(s) of Inspection 2 Schedule(s) of Circuit Details and Schedule(s) of Test Results'), all.includes('Schedules of Circuit Details and Test Results: pages 4–5. Total number of pages: 7.')], [true, true]);
eq('the other sources on continuation sheet No. 1, as Section F says', [pages[1].text.includes('Continuation sheet No. 1'), pages[2].text.includes('CONTINUATION SHEET No. 1'), pages[2].text.includes('Solar PV, 5.28 kWp')], [true, true, true]);
eq('the board’s RCD line (N/A here) and the empty right-hand box', [landscape[0].text.includes('RCD: BS (EN) N/A Type N/A Rating N/A A')], [true]);
eq('the worked-out max Zs says so in Remarks (footnote §)', A.includes(squash(ZS_SRC.B32)) && A.includes(squash(ZS_SRC.B20)), true);
eq('the notes for the person producing the certificate, and the guidance for recipients (A4 wording)', [all.includes('Regulation 644.4'), all.includes('Regulation 644.3'), IET_GUIDANCE.paragraphs.every((t) => A.includes(squash(t)))], [true, true, true]);
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
eq('three declarations, the design one signed', [all.split('hereby CERTIFY').length - 1, all.includes('Designer No 1'), all.includes('Designer No 2**'), all.includes('SARAH JONES'), all.includes('Constructor'), all.includes('Inspector')], [3, true, true, true, true, true]);
eq('the edition and the next inspection, “years/months.” as the form prints it (one struck out)', [all.includes('BS 7671:2018, amended to 2026 (A4)'), all.includes('not more than 10 years/months.')], [true, true]);
eq('readings print as given (>999, Ω, MΩ, mm², IΔn)', ['>999', 'Ω', 'MΩ', 'mm²', 'IΔn'].every((x) => A.includes(x)), true);
eq('no "?" stands in for a symbol, no "Not answered", no draft banner', [/\?/.test(all), all.includes('Not answered'), all.includes('Draft: not signed yet')], [false, false, false]);
eq('the footer on every page: the certificate number, page x of y, Heliaxis’s details, the form’s edition', pages.every((p, i) => p.text.includes(`Certificate No. HX-0042-EIC · Page ${i + 1} of ${pages.length}`) && p.text.includes('Heliaxis Ltd · 9 Turner Street') && p.text.includes('IET model form, BS 7671:2018+A4:2026')), true);
eq('no “to follow” for the guidance, no IET logo text', [all.includes('Guidance for recipients to follow'), /IET\s+logo/i.test(all)], [false, false]);

// 12 rows a sheet: a 13th circuit starts another sheet of each schedule.
const sheetsFor = async (n) => {
  const v = { ...ans };
  for (let i = 0; i < n - 3; i++) v[`eic_db:c-x${i}`] = a({ ...details(30 + i, `Circuit ${30 + i}`), ...tests, o: 30 + i });
  return (await pagesOf(await eicPdf({ ...base, values: ctxOf(v).values }))).filter((p) => p.w > p.h).length;
};
eq(`${ROWS} rows a sheet: 12 circuits on one sheet of each schedule, 13 on two`, [ROWS, await sheetsFor(12), await sheetsFor(13)], [12, 2, 4]);

// A board with 40 circuits: the schedules run over pages, headings and column numbers on each.
const many = { ...ans };
for (let i = 0; i < 40; i++) many[`eic_db:c-m${i}`] = a({ ...details(20 + i, `Circuit ${20 + i}`), ...tests, o: 20 + i });
const longPages = await pagesOf(await eicPdf({ ...base, values: ctxOf(many).values }));
const sched = longPages.filter((p) => p.w > p.h);
eq('long schedules: 43 circuits on four sheets of each', sched.length, 8);
eq('their headings repeat (circuit details)', sched.filter((p) => p.text.includes('GENERIC SCHEDULE OF CIRCUIT DETAILS')).map((p) => p.text.includes('Circuit description') && colNums(` ${p.text} `, 1, 16) === 'all'), [true, true, true, true]);
eq('their headings repeat (test results)', sched.filter((p) => p.text.includes('GENERIC SCHEDULE OF TEST RESULTS')).map((p) => p.text.includes('Maximum measured') && colNums(` ${p.text} `, 17, 31) === 'all'), [true, true, true, true]);
eq('Section J counts them all, with their pages', squash(longPages[1].text).includes(squash('8 Schedule(s) of Circuit Details and Schedule(s) of Test Results')) && longPages[1].text.includes(`pages 4–11. Total number of pages: ${longPages.length}.`), true);

// A long extent goes over to a continuation sheet, numbered in Section B and counted in J.
const longExtent = (await pagesOf(await eicPdf({ ...base, values: { ...c0.values, eic_extent: Array.from({ length: 14 }, (_, i) => `New circuit ${i + 1}: a radial for the outbuilding and its lights, in SWA.`).join(' ') } }))).map((p) => p.text);
eq('a long extent: “See continuation sheet No.: 1”, the sheet, and J counts B and F', [longExtent[0].includes('See continuation sheet No.: 1'), longExtent[2].includes('CONTINUATION SHEET No. 1') && longExtent[2].includes('New circuit 14'), longExtent[1].includes('2 Continuation sheet(s) for Section(s) B, F')], [true, true, true]);

// Another installation: TT with an electrode (Ze), an RCD main switch that's also a fuse switch, a board RCD, a T3 SPD,
// wiring "O", maximum demand in kVA, long departures, a permitted exception with its risk assessment attached.
const variant = {
  ...c0.values,
  eic_earthing: 'tt',
  eic_means: 'electrode',
  eic_rod_type: 'Rod',
  eic_rod_loc: 'Front garden, by the meter box',
  eic_ra: 21,
  eic_ra_kind: 'Ze',
  eic_md: 14,
  eic_md_unit: 'kVA',
  eic_ms_ocpd: 'yes',
  eic_ms_dev: 'Fuse(s)',
  eic_ms_set: 80,
  eic_ms_ka: 16,
  eic_ms_rcd: 'yes',
  eic_ms_rcd_type: 'A',
  eic_ms_idn: 100,
  eic_ms_delay: 150,
  eic_ms_time: 190,
  eic_ms_rcd_ka: 10,
  eic_dep: 'yes',
  eic_dep_what: 'The battery is in the garage 0.9 m from the gas meter rather than the 1 m in the manufacturer’s instructions, agreed with the customer as there was no other suitable place; a fire-rated board is fitted between them and the customer has the manufacturer’s letter accepting it, kept with this certificate.',
  eic_exc: 'yes',
  eic_exc_what: 'The existing garage socket circuit has no 30 mA RCD protection; it is labelled for specific equipment and backed by a risk assessment.',
  'eic_db:b-b1': { ...c0.values['eic_db:b-b1'], spd: ['T2', 'T3'], rcd: 'yes', rcd_bs: '61008-1', rcd_type: 'A', rcd_a: 100, rcd_idn: 100 },
  'eic_db:c-c1': { ...c0.values['eic_db:c-c1'], spd_t3: 'the inverter’s AC supply', wiring: 'O', wiring_other: 'Thermosetting flexible cable (H07RN-F) to the inverter' },
};
const vpages = (await pagesOf(await eicPdf({ ...base, values: variant, attachments: [{ slot: 'eic_exc_ra', bytes: PNG }] }))).map((p) => p.text);
const V = squash(vpages.join('\n'));
eq('long departures go to a continuation sheet, numbered where they’d be', [vpages[0].includes('(continued on continuation sheet No. 1)'), vpages[2].includes('CONTINUATION SHEET No. 1') && vpages[2].includes('fire-rated board')], [true, true]);
eq('the exceptions and the risk assessment attached: a continuation sheet for C (and one for long remarks), all counted in J', [vpages[3].includes('CONTINUATION SHEET No. 2') && vpages[3].includes('Risk assessment attached'.toLowerCase()), vpages[1].includes('4 Continuation sheet(s) for Section(s) C, F, Schedules')], [true, true]);
eq('the exceptions box says where the risk assessment is; the sheet has the form’s words and the photo', [vpages[0].includes('Risk assessment: see continuation sheet No. 2'), vpages[3].includes('Risk assessment attached:')], [true, true]);
eq('the electrode (Ze), the demand in kVA, the main switch’s fuse and RCD, all on page 2', ['Front garden, by the meter box', 'Electrode resistance/impedance', 'Fuse(s)', 'Rated time delay 150 ms', 'Breaking capacity 10 kA'].map((t) => squash(vpages[1]).includes(squash(t))), [true, true, true, true, true]);
eq('the board’s RCD line, the T3 box, the T3 and wiring “O” in Remarks (footnote †)', [squash(vpages.join(' ')).includes(squash('RCD: BS (EN) 61008-1 Type A Rating 100 A')), V.includes(squash('T3 SPD: the inverter’s AC supply')), V.includes(squash('Type of wiring O: Thermosetting flexible cable (H07RN-F) to the inverter'))], [true, true, true]);

// An "other" main switch device too long for the form's short blank: stated on G's continuation sheet.
const devPages = (await pagesOf(await eicPdf({ ...base, values: { ...c0.values, eic_ms_ocpd: 'yes', eic_ms_dev: 'other', eic_ms_dev_other: 'Switch-disconnector-fuse with BS 88 fuse links', eic_ms_set: 100, eic_ms_ka: 16 } }))).map((p) => p.text);
eq('a long “other” device type: page 2 points to the sheet, which states it; J counts G', [devPages[1].includes('Device type: see continuation sheet No. 2'), devPages.some((t) => t.includes('CONTINUATION SHEET No. 2') && t.includes('Switch-disconnector-fuse with BS 88 fuse links')), devPages[1].includes('2 Continuation sheet(s) for Section(s) F, G')], [true, true, true]);

// A draft: the design part not signed yet.
const draftBytes = await eicPdf({ ...base, design: null, draft: true });
keep('EIC-draft.pdf', draftBytes);
const dtext = (await pagesOf(draftBytes)).map((p) => p.text).join('\n');
eq('until the office signs, a draft on every page, the design part to follow', [dtext.split('Draft: not signed yet').length - 1, dtext.includes('To follow: Heliaxis signs the design part')], [(await pagesOf(draftBytes)).length, true]);
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
eq('nor with a reading missing', threw, 'External earth fault loop impedance, Ze');

// Single signature (the form's Note 3): the same three parts, the one person signing in each place.
const singleBytes = await eicPdf({ ...base, route: 'eic_single', values: { ...c0.values, eic_route: 'eic_single', eic_next: 10, eic_next_unit: 'years' }, sig: { one: sig }, design: null });
keep('EIC-single.pdf', singleBytes);
const spages = await pagesOf(singleBytes);
const stext = spages.map((p) => p.text).join('\n');
eq('single signature: three declarations, the same name as Designer No 1, Constructor and Inspector, no “(single signature)”', [
  stext.split('hereby CERTIFY').length - 1,
  (spages[0].text.match(/DAVE PRICE/g) ?? []).length,
  ['Designer No 1', 'Designer No 2**', 'Constructor', 'Inspector'].every((r) => spages[0].text.includes(r)),
  stext.includes('single signature)'),
  stext.includes('Designer, constructor and inspector'),
], [3, 3, true, false, false]);
eq('…and in Section E (Designer No 2: N/A), the next inspection from the electrician', [(spages[1].text.match(/Name: Dave Price/g) ?? []).length, spages[1].text.includes('Name: N/A'), stext.includes('not more than 10 years')], [3, true, true]);

// Minor Works: one sheet per circuit; a data sheet until its wording is verified.
const mwList = W.meiwcList(mw);
const mwBytes = await meiwcPdf({ ref: mwList[0].ref, jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: { ...mw.values, eic_mw_fp: 'ADS (automatic disconnection of supply)' }, address: mw.address, circuit: { ...mwList[0].circuit, work: 'Added a socket' }, name: mwList[0].name, sig, draft: false });
keep('MEIWC-1.pdf', mwBytes);
const mtext = (await pagesOf(mwBytes)).map((p) => p.text).join('\n');
eq('Minor Works: a data sheet while unverified, titled so, for this circuit', [mtext.includes('Minor Works data sheet'), mtext.includes('It isn’t the certificate'), mtext.includes('DB1 circuit 7'), mtext.includes('Added a socket')], [true, true, true, true]);
const mwCert = (await pagesOf(await meiwcPdf({ ref: 'HX-0042-MW1', jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: { ...mw.values, eic_mw_fp: 'ADS' }, address: mw.address, circuit: { ...mwList[0].circuit, work: 'Added a socket' }, name: mwList[0].name, sig, draft: false, wording: { verified: true, declaration: (x) => `TEST MW WORDING to ${x}` } }))).map((p) => p.text).join('\n');
eq('once verified: the certificate with its declaration', [mwCert.includes('Minor Electrical Installation Works Certificate'), mwCert.includes('TEST MW WORDING to 2026 (A4)'), mwCert.includes('data sheet')], [true, true, false]);

/* ── The assessor's pass: long entries, two boards, both signing routes ──── */

// Items with where they are (x, y), for checks a page's words can't show (one line, not two).
async function itemsOf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => ({ s: x.str, x: x.transform[4], y: x.transform[5] })));
  return out;
}
const LONG = {
  client: 'Mr and Mrs Bartholomew-Fitzgerald-Williams (care of the property management company)',
  clientAddr: 'Apartment 3, Riverside Court Business Quarter, 45-49 Usk Way, Newport, NP20 2BW',
  desc: 'Installation of solar PV (8.4 kWp, 21 panels on two roofs, east and west), two 9.5 kWh batteries in the garage, a new 18-way dual-RCD consumer unit replacing the old rewireable fuse board, a sub-board in the detached garage and an EV charge point on the drive',
  loc: 'In the detached double garage at the bottom of the garden, on the back wall behind the workbench',
  cdesc: 'Workshop sockets on the back wall, the bench grinder, the compressor and the lighting over the workbench and the loft hatch, wired in SWA from DB2',
};
const big = { ...ans, eic_client: a(LONG.client), eic_client_addr: a(LONG.clientAddr), eic_desc: a(LONG.desc), eic_ec_mat: a('other'), eic_ec_mat_other: a('Copper-clad aluminium') };
for (let i = 1; i <= 20; i++) big[`eic_db:c-k${i}`] = a({ ...details(i, i === 5 ? 'Sockets: kitchen worktop, island and the utility room appliances (washer, dryer)' : `Circuit ${i} lights and sockets`), ...tests, o: i });
for (const k of ['eic_db:c-c1', 'eic_db:c-c2', 'eic_db:c-c3']) delete big[k];
big['eic_db:b-b2'] = a({ o: 2, ref: 'DB2', loc: LONG.loc, from: 'DB1 circuit 20', ocpd_bs: '60898-1', ocpd_type: 'C', ocpd_a: 40, spd: ['T2', 'T3'], rcd: 'yes', rcd_bs: '61008-1', rcd_type: 'A', rcd_a: 63, rcd_idn: 100, zdb: 0.61, ipf: 0.62, pol: true, spd_ok: 'yes' });
for (let i = 1; i <= 3; i++) big[`eic_db:c-g${i}`] = a({ ...details(i, i === 2 ? LONG.cdesc : `Garage circuit ${i}`, { board: 'b2', ocpd_a: 16, zs_max: 2.73, zs_src: null }), ...tests, o: i, zs: 0.9 });
eq('the gate asks what an “other” conductor material is', E.certMissing(ctxOf({ ...big, eic_ec_mat_other: undefined })).map((m) => m.key), ['eic_ec_mat_other']);
const bigCtx = ctxOf(big);
eq('the big job is complete on the phone', E.certMissing(bigCtx), []);
for (const [label, extra] of [
  ['three signatures', {}],
  ['single signature', { route: 'eic_single', values: { ...bigCtx.values, eic_route: 'eic_single', eic_next: 6, eic_next_unit: 'months' }, sig: { one: sig }, design: null }],
]) {
  const b = await eicPdf({ ...base, values: bigCtx.values, address: 'Flat 14, The Old Granary Buildings, 123 Llanthewy Road, off Stow Hill, St Woolos, Newport, Gwent, NP20 4JR', ...extra });
  keep(`EIC-big-${extra.route ?? 'eic'}.pdf`, b);
  const pg = await pagesOf(b);
  const it = await itemsOf(b);
  const T = pg.map((p) => p.text);
  const S = squash(T.join('\n'));
  const kinds2 = pg.map((p) => (p.w > p.h ? (p.text.includes('GENERIC SCHEDULE OF CIRCUIT DETAILS') ? 'D' : 'T') : 'P')).join('');
  eq(`${label}: A–D on page 1, E–J on page 2, then 2 sheets of each schedule for DB1 (20 circuits) and 1 for DB2`, [SECTIONS.slice(0, 4).every((h) => T[0].includes(h)), SECTIONS.slice(4).every((h) => T[1].includes(h)), kinds2.replace(/^P+/, '').replace(/P+$/, '')], [true, true, 'DTDTDT']);
  eq(`${label}: Section J counts them, Section H as the schedule of inspection`, [squash(T[1]).includes(squash('1 Schedule(s) of Inspection 6 Schedule(s) of Circuit Details and Schedule(s) of Test Results')), /Total number of pages: (\d+)\./.exec(T[1])?.[1]], [true, String(pg.length)]);
  // Nothing written is lost: each long entry is on the form whole, or on a continuation sheet word for word.
  eq(`${label}: the long client, description, location and circuit description are all there in full`, [LONG.client, LONG.clientAddr, LONG.desc, LONG.loc, LONG.cdesc, 'Copper-clad aluminium'].map((t) => S.includes(squash(t))), [true, true, true, true, true, true]);
  eq(`${label}: nothing cut short, except a cell that says where the rest is`, T.join('\n').match(/…(?! \(see continuation sheet No\. \d+\))/g), null);
  eq(`${label}: the client on Section A’s two lines, not shrunk`, it[0].filter((x) => x.s.startsWith('Mr and Mrs Bartholomew')).length, 1);
  // Section J's filled-in line stays one line above "The schedule(s) and continuation sheet(s) listed…".
  const j0 = it[1].findIndex((x) => x.s.trim() === 'Continuation');
  const j1 = it[1].findIndex((x) => x.s.startsWith('The schedule(s) and continuation'));
  const jy = it[1].slice(j0, j1).filter((x) => x.s.trim()).map((x) => Math.round(x.y));
  const vy = it[1][j1]?.y;
  eq(`${label}: Section J’s line is one line, clear of the next`, [new Set(jy).size, jy.every((y) => y - vy > 8)], [1, true]);
  // The headings run up their columns on one line each, as on the form.
  const heads = new Set(it.filter((_, i) => pg[i].w > pg[i].h).flat().map((x) => x.s));
  eq(`${label}: the long column headings on one line`, ['Number of points served', 'Breaking capacity (kA)', 'Disconnection time (ms)**', 'Test button operation', 'Manual test button operation', 'Maximum measured'].filter((h) => !heads.has(h)), []);
}

/* ── For the rest of the pack ────────────────────────────────────────────── */

const sum = E.eicSummary(ctxOf({ ...ans, eic_design: a({ ...design, png: undefined }) }));
eq('the battery inspection and the system summary read the EIC: reference, schedules, circuits, next inspection', [sum.refs, sum.circuits.length, sum.next, sum.complete], ['HX-0042-EIC: Schedule of inspections, Schedules of circuit details and test results', 3, '10 years', true]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
