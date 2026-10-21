// The handover pack's catalogue and states (src/lib/handover/slots.ts) and what each of its own
// documents is made from (src/lib/handover/inputs.ts): every item of the owner's list has a slot,
// the applies rules and automatic reasons per technology mix and DNO route, "no route chosen" is
// Missing, all five states, Out of date after a change on a sent document, the send gate (D23), pack
// order and contents grouping, and "never invent": F78 with no system class is Missing and prints no
// guessed value, F49 with no interval prints the manufacturer line, the receipt lists exactly the
// recorded payments.
// Usage: node --experimental-strip-types scripts/test-handover-slots.mjs
import { registerHooks } from 'node:module';

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
const S = await import('../src/lib/handover/slots.ts');
const I = await import('../src/lib/handover/inputs.ts');
const H = await import('../src/lib/handover/settings-shared.ts');
const { designOf } = await import('../src/lib/site/design.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── The catalogue ────────────────────────────────────────────────────────── */

const OWNER_LIST = ['F07BI', 'F74', 'F19I', 'F43', 'F75', 'F44', 'F44A', 'F78', 'F74B', 'F16E', 'F47', 'F48I', 'F74A', 'F49', 'F49A', 'F76', 'CC4', 'CC5', 'CC10', 'CC13', 'CC14', 'CC21', 'CC15', 'CC16', 'CC17', 'CCMH'];
eq('every document in the owner’s list has a slot', OWNER_LIST.filter((c) => !S.slotDef(c)), []);
eq('26 items plus the combined PACK', [S.PACK_ITEMS.length, S.SLOTS.length], [26, 27]);
eq('titles as in his system', [S.slotDef('F76').title, S.slotDef('CC16').title, S.slotDef('F74B').title], ['G99 A1.2 Issue 1.9', 'Insurance Backed Guarantee / MCS Financial Protection Product', 'PAS 63100 Statement of Conformity (Battery)']);
eq('every item has a customer line and a contents group', S.PACK_ITEMS.filter((s) => !s.customer || !s.group).map((s) => s.code), []);
eq(
  'pack order is the customer order (HANDOVER 2.6)',
  [...S.PACK_ITEMS].sort((a, b) => a.order - b.order).map((s) => s.code),
  ['F07BI', 'F78', 'CC17', 'CC21', 'F74B', 'CC14', 'F19I', 'CC16', 'F16E', 'CC4', 'F48I', 'F49', 'F49A', 'CC10', 'CC15', 'F43', 'F44', 'F44A', 'F74', 'F75', 'F74A', 'F47', 'F76', 'CC5', 'CC13', 'CCMH']
);
eq('"Which is it?" ends with Something else', S.UPLOAD_PICKS.map((s) => s.pick), ['MCS certificate', 'Electrical certificate (EIC)', 'Building Control certificate', 'Insurance-backed guarantee', 'Schematic', 'Design calculations', 'G99 paperwork', 'Paid invoice', 'Something else']);

/* ── Applies: technologies and the DNO route ──────────────────────────────── */

const applies = (products, extra = {}) => {
  const c = { products, dnoRoute: 'g98', pas63100: true, maintenancePlan: false, ...extra };
  return Object.fromEntries(S.PACK_ITEMS.map((s) => [s.code, s.applies(c)]));
};
const yes = (m) => Object.keys(m).filter((k) => m[k] === null);
eq(
  'EV only: F07BI, F19I, F16E, CC4, CC5, CC13, CC14, CC21 (and the optional extras)',
  yes(applies(['ev'])),
  ['F07BI', 'CC21', 'CC14', 'F19I', 'F16E', 'CC4', 'CC5', 'CC13', 'CCMH']
);
eq('EV only: the rest say why', [applies(['ev']).F43, applies(['ev']).F78, applies(['ev']).F74, applies(['ev']).CC17], ['No solar panels on this job', 'No solar or battery on this job', 'No battery on this job', 'No MCS certificate for this job’s technologies']);
eq('heat pump only: MCS certificate and guarantee apply', [applies(['heatpump']).CC17, applies(['heatpump']).CC16, applies(['heatpump']).F78], [null, null, 'No solar or battery on this job']);
const sb = applies(['solar', 'battery']);
eq('solar + battery, G98, PAS ticked, no plan: G99 and the agreement not needed', [sb.F76, sb.F49A, sb.F47, sb.F74A], ['G98 job: the DNO is told after', 'No maintenance plan sold', null, null]);
eq('G99 route: Form B not needed', applies(['solar'], { dnoRoute: 'g99' }).F47, 'G99 job: Form B isn’t used');
eq('demand only / not needed: neither', [applies(['solar'], { dnoRoute: 'demand' }).F76, applies(['battery'], { dnoRoute: 'not_needed' }).F47], ['Demand only: no generation paperwork', 'No DNO paperwork needed on this job']);
eq('no route chosen: both apply (and ask for it)', [applies(['solar'], { dnoRoute: null }).F47, applies(['solar'], { dnoRoute: null }).F76], [null, null]);
eq('PAS 63100 not ticked: F74A/F74B not needed', [applies(['battery'], { pas63100: null }).F74A, applies(['battery'], { pas63100: false }).F74B], ['PAS 63100 isn’t ticked for this battery (Job details)', 'PAS 63100 isn’t ticked for this battery (Job details)']);
eq('a plan sold: F49A applies', applies(['solar'], { maintenancePlan: true }).F49A, null);

/* ── States ───────────────────────────────────────────────────────────────── */

let n = 0;
const doc = (slot, extra = {}) => ({ id: `d${++n}`, slot, name: `${slot}.pdf`, source: 'generated', key: slot, visible: false, release: 'with_pack', at: '2026-11-03T17:42:00Z', version: 1, mime: 'application/pdf', size: 1000, hash: `h-${slot}`, ...extra });
const ready = (code) => ({ ready: true, hash: `h-${code}` });
const ctx = (over = {}) => ({
  products: ['solar', 'battery'],
  dnoRoute: 'g98',
  pas63100: false,
  maintenancePlan: false,
  docs: [],
  marks: {},
  gen: {},
  electrician: 'signed',
  electricianName: 'Dave Price',
  partPBy: 'heliaxis',
  commissioned: '2026-11-03',
  paperwork: {},
  dnoSubmitted: false,
  dnoNotified: false,
  due: { mcs: '2026-11-17', regs: '2026-12-03', g98: '2026-12-01', cc16: null },
  invoicePaid: false,
  libraryGaps: [],
  models: ['JA Solar JAM54S30', 'GivEnergy AIO'],
  designDoc: false,
  sent: false,
  ...over,
});
const byCode = (views) => Object.fromEntries(views.map((v) => [v.code, v]));

// Part-complete: the electrician has signed; their documents are in; the office's are to come.
const partDocs = ['F43', 'F44', 'F44A', 'F74', 'F75', 'CC21'].map((c) => doc(c, { source: c === 'CC21' ? 'generated' : 'generated' }));
const partGen = { F07BI: ready('F07BI'), F78: { ready: false, state: 'missing', why: 'Sign the design part.', fix: 'sign-design' }, F16E: { ready: false, state: 'waiting', why: 'Waiting for Jane to sign.' }, F49: ready('F49'), F48I: { ready: false, state: 'missing', why: 'MIS 3002…', fix: 'upload' }, F47: ready('F47'), CC4: ready('CC4'), F19I: { ready: false, state: 'missing', why: 'Set the warranty…', fix: 'settings' } };
const part = byCode(S.slotStates(ctx({ docs: [...partDocs, doc('F07BI'), doc('F49'), doc('F47'), doc('CC4')], gen: partGen })));
eq('site documents in: Complete', ['F43', 'F44', 'F44A', 'F74', 'F75', 'CC21'].map((c) => part[c].state), ['complete', 'complete', 'complete', 'complete', 'complete', 'complete']);
eq('MCS certificate: Waiting, due in 10 working days', [part.CC17.state, part.CC17.why, part.CC17.due], ['waiting', 'Due Tue 17 Nov (10 working days)', '2026-11-17']);
eq('guarantee: Waiting until the MCS certificate', [part.CC16.state, part.CC16.why], ['waiting', 'After the MCS certificate.']);
eq('Building Control: Missing (Heliaxis notifies), due in 30 days', [part.CC14.state, part.CC14.fix], ['missing', 'notify-bc']);
eq('Building Control by the electrician’s scheme: Waiting for them', byCode(S.slotStates(ctx({ partPBy: 'self' }))).CC14.why, 'Waiting for Dave to notify their scheme and send the reference.');
eq('F78: Missing until the design part is signed', [part.F78.state, part.F78.fix], ['missing', 'sign-design']);
eq('F16E: Waiting for the customer', part.F16E.state, 'waiting');
eq('F47 made but not sent: Missing, mark it sent', [part.F47.state, part.F47.fix], ['missing', 'dno-sent']);
eq('F47 marked sent: Complete', byCode(S.slotStates(ctx({ docs: [doc('F47')], gen: { F47: ready('F47') }, dnoNotified: true }))).F47.state, 'complete');
eq('F47 with the form as sent uploaded: Complete', byCode(S.slotStates(ctx({ docs: [doc('F47', { source: 'upload', key: null })] }))).F47.state, 'complete');
eq('not needed: F76 (G98 job), F49A (no plan), F74A/B (PAS not ticked)', ['F76', 'F49A', 'F74A', 'F74B'].map((c) => part[c].state), ['na', 'na', 'na', 'na']);
eq('CCMH is never Missing and never counted', [part.CCMH.state, part.CCMH.counted], ['na', false]);
eq('CC13 before the pack goes: Waiting', [part.CC13.state, part.CC13.why], ['waiting', 'After the handover pack goes.']);
eq('CC13 after: Missing, send the final invoice', byCode(S.slotStates(ctx({ sent: true }))).CC13.state, 'missing');
eq('CC13 invoice uploaded, unpaid: Waiting', byCode(S.slotStates(ctx({ docs: [doc('CC13', { source: 'upload', key: null })] }))).CC13.why, 'Final invoice not paid yet.');
eq('CC13 invoice uploaded and paid: Complete', byCode(S.slotStates(ctx({ docs: [doc('CC13', { source: 'upload', key: null })], invoicePaid: true }))).CC13.state, 'complete');
eq('CC5 with nothing attached yet: from the library', [part.CC5.state, part.CC5.fix], ['missing', 'library']);
const gap = byCode(S.slotStates(ctx({ libraryGaps: ['GivEnergy AIO'] }))).CC5;
eq('CC5 library gap: Missing with the model named', [gap.state, gap.why], ['missing', 'No manual or datasheet for GivEnergy AIO: upload it once and every job with that model gets it.']);
eq('CC5 with no models on the job: Missing, add them', byCode(S.slotStates(ctx({ models: [] }))).CC5.why, 'Add the product models on Job details.');

const h = S.headline(Object.values(part));
eq('headline: Complete against everything that applies', h.words, `${h.complete} of ${h.total} complete · ${h.waiting} waiting · ${h.missing} missing · ${h.na} not needed`);
eq('headline counts (21 apply: the 26, less G99, the agreement, PAS 63100 twice and the extras)', [h.complete, h.total, h.na], [9, 21, 4]);

// No route chosen: Missing, never silently not needed.
const noRoute = byCode(S.slotStates(ctx({ dnoRoute: null })));
eq('no DNO route: F47 and F76 Missing, choose it on Paperwork', [noRoute.F47.state, noRoute.F47.why, noRoute.F76.state, noRoute.F47.fix], ['missing', 'Choose the DNO route on Paperwork.', 'missing', 'paperwork']);

// G99: the papers by part.
const g99 = (docs, extra = {}) => byCode(S.slotStates(ctx({ dnoRoute: 'g99', docs, ...extra }))).F76;
eq('G99 application sent: Waiting for the DNO', g99([], { dnoSubmitted: true }).why, 'Application sent, waiting for the DNO.');
eq('G99 acceptance only: still the installation document', g99([doc('F76', { source: 'upload', part: 'acceptance' })]).why, 'Still to upload: the installation document.');
eq('G99 acceptance and installation document: Complete', g99([doc('F76', { source: 'upload', part: 'acceptance' }), doc('F76', { source: 'upload', part: 'installation' })]).state, 'complete');

// Office marks: Not needed with a reason, and who.
const marked = byCode(S.slotStates(ctx({ marks: { CC15: { na: true, reason: 'No structural or other calculations needed for this design', by: 'Sarah', at: '2026-11-03T10:00:00Z' } } }))).CC15;
eq('office Not needed: reason and who', [marked.state, marked.why, marked.office?.by], ['na', 'No structural or other calculations needed for this design', 'Sarah']);

// Out of date: one of ours whose inputs changed after it went to the customer.
const sentF78 = byCode(S.slotStates(ctx({ docs: [doc('F78', { visible: true, hash: 'old' })], gen: { F78: ready('F78') } }))).F78;
eq('Out of date: a sent document whose inputs changed', [sentF78.state, sentF78.why], ['stale', 'The details changed after it went to the customer: regenerate it.']);
eq('Complete when the inputs match', byCode(S.slotStates(ctx({ docs: [doc('F78', { visible: true })], gen: { F78: ready('F78') } }))).F78.state, 'complete');
const foreign = byCode(S.slotStates(ctx({ docs: [doc('F43', { visible: true, stale: true })] }))).F43;
eq('Out of date: another unit’s document marked by the store', foreign.state, 'stale');
eq('Waiting: the electrician still working', byCode(S.slotStates(ctx({ electrician: 'working' }))).F43.why, 'Waiting for Dave (electrician)');
eq('Missing: no electrician on the job', byCode(S.slotStates(ctx({ electrician: 'none' }))).F43.fix, 'site');
eq('all five states seen', [...new Set(Object.values(part).concat(sentF78).map((v) => v.state))].sort(), ['complete', 'missing', 'na', 'stale', 'waiting']);

// The send gate (D23): every site document Complete; the office's can follow.
eq('Send is held while F78 is missing', [S.sendCheck(Object.values(part)).ok, S.sendCheck(Object.values(part)).blocking.map((v) => v.code)], [false, ['F78']]);
const done = byCode(S.slotStates(ctx({ docs: [...partDocs, doc('F78')], gen: { ...partGen, F78: ready('F78') } })));
const sc = S.sendCheck(Object.values(done));
eq('Send allowed once the site documents are in; the rest follow', [sc.ok, sc.following.map((v) => v.code).includes('CC17')], [true, true]);

// Customer view, pack contents grouping.
eq('portal: a waiting item is "on its way", a not-needed one hidden', [S.customerState(part.CC17), S.customerState(part.F76), S.customerState({ ...part.F43, docs: [doc('F43', { visible: true })] })], ['coming', null, 'ready']);
const groups = S.contentsGroups(Object.values(part).filter((v) => v.state !== 'na' && v.code !== 'F07BI'));
eq('contents groups in order', groups.map((g) => g.title), ['Certificates', 'Warranties and guarantees', 'Using and looking after your system', 'Design', 'Test and inspection records', 'Grid connection', 'Manufacturer information', 'Invoices']);
eq('certificates in pack order', groups[0].items.map((v) => v.code), ['F78', 'CC17', 'CC21', 'CC14']);
eq('model names compared ignoring case, spaces and dashes', S.modelKey('GIV-AIO 13.5') === S.modelKey('giv aio13.5'), true);

/* ── Inputs: never invent ─────────────────────────────────────────────────── */

const settings = H.cleanHandoverSettings({
  ...H.DEFAULT_HANDOVER_SETTINGS,
  approved: Object.fromEntries(Object.entries(H.DRAFTS).map(([k, d]) => [k, { version: d.version, at: '2026-10-01T09:00:00Z', by: 'Callum' }])),
  nextInspectionYears: null,
});
const facts = (over = {}) => ({
  today: '2026-11-03',
  job: { id: 'p1', ref: 'HX-0042', title: 'Solar and battery', stage: 'installing', products: ['solar', 'battery'], addressLines: ['12 High Street', 'Maindee', 'Newport', 'NP20 4AB'], postcode: 'NP20 4AB', installDays: ['2026-11-02', '2026-11-03'], commissionedOn: '2026-11-03', handedOverOn: null, dno: { route: 'g98', status: null, ref: null, submittedAt: null, notified: false }, deposit: { amount: 500, paidAt: '2026-10-05T10:00:00Z', ref: 'pi_123' } },
  customer: { name: 'Jane Smith', first: 'Jane', email: 'jane@example.com', phone: '07700 900123' },
  owner: { name: 'Callum Hughes' },
  system: { kwp: 5.28, panel_count: 12, panel_model: 'JA Solar JAM54S30 440', inverter_model: 'GivEnergy Gen 3 5 kW', inverter_kw: 5, battery_model: 'GivEnergy 9.5 kWh', battery_kwh: 9.5, ev_charger_model: null, heat_pump_model: null, heat_pump_kw: null, mpan: '1012345678901', export_limit_kw: null, monitoring: 'GivEnergy' },
  design: designOf({ est_kwh_year: 4620, shade_factor: 0.95, eess_class: 1, battery_kw: 3.6, roof_faces: 'Rear roof', battery_backup: true }),
  paperwork: {},
  electrician: { name: 'Dave Price', company: 'Price Electrical', status: 'done', signedAt: '2026-11-03T17:41:00Z', signedOn: '2026-11-03', signaturePath: 'signatures/p1/site-s1.png', values: { f78_kind: 'initial', eess_backup: 'yes', f78_p_circuits: '2 PV strings; 1 AC circuit' }, customer: {}, partPBy: 'heliaxis', certRef: 'HX-0042-EIC', nextInspection: null },
  data: { F78: { design: { name: 'Callum Hughes', signed_at: '2026-11-03T18:00:00Z', path: 'signatures/p1/f78-design.png', by: 'u1' } } },
  library: [],
  payments: [],
  survey: { shading: ['Chimney'], sunPath: null },
  made: ['F43', 'F44', 'F44A', 'F74', 'F75'],
  settings,
  ...over,
});
eq('F78 with no next inspection anywhere: Missing (never a guessed number)', I.f78Input(facts()).why, 'Set the next inspection (years) in CRM settings: the EIC doesn’t give one.');
const f78ok = I.f78Input(facts({ settings: { ...settings, nextInspectionYears: 10 } }));
eq('F78 with everything: ready, references from the job', [f78ok.ok, f78ok.input?.pv?.f44a, f78ok.input?.pv?.insp, f78ok.input?.eess?.parts], [true, 'HX-0042-F44A', 'HX-0042-EIC: Schedule of inspections', [true, true, true, true]]);
eq('F78 PV description from the job', f78ok.input?.pv?.desc, '12 × JA Solar JAM54S30 440 (5.28 kWp), GivEnergy Gen 3 5 kW');
const noClass = I.f78Input(facts({ design: designOf({ est_kwh_year: 4620, shade_factor: 0.95, battery_kw: 3.6, roof_faces: 'Rear roof' }), settings: { ...settings, nextInspectionYears: 10 } }));
eq('F78 with no system class: Missing, named, nothing printed', [noClass.ok, noClass.why, 'input' in noClass], [false, 'Needs the battery system class on Job details.', false]);
eq('F78 before the electrician signs: Waiting', I.f78Input(facts({ electrician: { ...facts().electrician, signedAt: null, signaturePath: null } })).state, 'waiting');
eq('F78 without the design signature: Sign the design part', I.f78Input(facts({ data: {}, settings: { ...settings, nextInspectionYears: 10 } })).fix, 'sign-design');

const sched = I.scheduleInput(facts());
eq('F49 with no interval prints the manufacturer line', sched.input.rows.filter((r) => r.item.startsWith('Battery')).map((r) => r.often), [I.MANUAL_SAYS]);
eq('F49 electrical row follows the EIC when it has no figure', sched.input.rows[0].often, 'As your Electrical Installation Certificate says');
const withInterval = I.scheduleInput(
  facts({ library: [{ id: 'l1', name: 'GivEnergy manual', kind: 'manual', models: ['GivEnergy 9.5 kWh'], slot: 'CC5', technologies: ['battery'], every_pack: false, details: { 'GivEnergy 9.5 kWh': { interval: { every: 'Every 12 months', source: 'GivEnergy installation manual 4.2' } } }, storage_path: 'library/x.pdf', compact_path: null, mime: 'application/pdf', size: 1 }] })
);
eq('F49 interval from the library, with its source', withInterval.input.rows.find((r) => r.item.startsWith('Battery')), { item: 'Battery (GivEnergy 9.5 kWh)', check: 'Check it’s charging and discharging in the app', who: 'You', often: 'Every 12 months', source: 'GivEnergy installation manual 4.2' });

eq('F48I: never made until MIS 3002’s wording is copied in', [I.shadingInput(facts()).ok, I.shadingInput(facts()).fix], [false, 'upload']);
eq('F48I: no design figures, Missing (the handover never works one out)', I.shadingInput(facts({ design: designOf({}) })).why, 'Add the estimated generation and the shade factor from the design on Job details.');
eq('F48I: with verified wording (fixture), ready', I.shadingInput(facts(), { source: 'MIS 3002', issue: 'test', verified: true, importantNote: 'FIXTURE', shadingNote: 'FIXTURE 2' }).ok, true);

eq('F19I: no term set, Missing, upload your own', [I.warrantyInput(facts()).ok, I.warrantyInput(facts()).fix], [false, 'settings']);
const w = I.warrantyInput(facts({ settings: { ...settings, warrantyYears: 10, warrantyStart: 'commissioning', warrantyText: 'Our wording.' } }));
eq('F19I: term, start and wording set, dated from switching on; policy to follow', [w.ok, w.input.start, w.input.backedBy], [true, '2026-11-03', null]);

eq('F16E: Waiting for the customer to sign', I.completionInput(facts()).why, 'Waiting for Jane to sign (on the electrician’s phone or in their portal).');
const sig = { name: 'Jane Smith', signed_at: '2026-11-03T17:50:00Z', path: 'signatures/p1/site-s1-cust-f16e.png', via: 'phone' };
eq('F16E: signed on the phone, ready', I.completionInput(facts({ electrician: { ...facts().electrician, customer: { f16e: sig } } })).ok, true);

eq('G98 data sheet: no MPAN, Missing', I.g98Input(facts({ system: { ...facts().system, mpan: null } })).why, 'Add the MPAN on Job details.');
eq('CC4: no switch locations, Missing and named', I.switchInput(facts()).why, 'Say where the switches are: consumer unit circuit, ac isolator, dc isolator and battery isolator.');
const sw = I.switchInput(facts({ data: { CC4: { values: { cu: 'Hall, labelled Solar PV', ac: 'Loft, by the inverter', dc: 'Built into the inverter', battery: 'Side of the battery' } } } }));
eq('CC4: back-up warning on a back-up job', [sw.ok, sw.input.steps.some((s) => s.includes('back-up power'))], [true, true]);

const rec = I.receiptInput(facts({ payments: [{ id: 'x1', kind: 'final', amount_pence: 512345, paid_on: '2026-11-10', method: 'bank_transfer', reference: 'INV-0042' }] }));
eq('receipt: exactly the recorded payments (the deposit, then the final), nothing worked out', rec.input.lines.map((l) => [l.what, l.pence]), [['Deposit', 50000], ['Final payment', 512345]]);
eq('receipt: nothing recorded, nothing made', I.receiptInput(facts({ job: { ...facts().job, deposit: { amount: 500, paidAt: null, ref: null } } })).ok, false);

const cover = I.coverInput(facts(), Object.values(part));
eq('cover letter: what to follow says so', cover.input.contents.find((g) => g.group === 'Certificates').items.find((i) => i.title === 'MCS Certificate').status, 'To follow: we register it with MCS within 10 working days of switching your system on');
eq('cover letter: installed in plain words', cover.input.installed, ['12 × JA Solar JAM54S30 440 solar panels (5.28 kWp)', 'GivEnergy Gen 3 5 kW inverter (5 kW)', 'GivEnergy 9.5 kWh battery (9.5 kWh usable)']);
eq('cover letter: not approved, not made', I.coverInput(facts({ settings: H.DEFAULT_HANDOVER_SETTINGS }), []).fix, 'settings');
eq('MID copy fields in order', I.midFields(facts()).slice(0, 4).map((x) => x.label), ['Installation address', 'Customer', 'Commissioning date', 'MPAN']);
eq('install days in words', [I.daysWords(['2026-11-02', '2026-11-03']), I.daysWords(['2026-10-30', '2026-11-02', '2026-11-03'])], ['2 and 3 November 2026', '30 October to 3 November 2026']);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
