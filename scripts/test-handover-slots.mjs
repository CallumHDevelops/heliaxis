// The handover pack's catalogue and states (src/lib/handover/slots.ts) and what each of its own
// documents is made from (src/lib/handover/inputs.ts): every item of the owner's list has a slot,
// the applies rules and automatic reasons per technology mix and DNO route, "no route chosen" is
// Missing, all five states, Out of date after a change on a sent document, the send gate (D23), pack
// order and contents grouping, and "never invent": the system summary (HX-HO-02) with no system class
// is Missing and prints no guessed value, the maintenance schedule (HX-HO-11) with no interval prints
// the manufacturer line, the receipt lists exactly the recorded payments. Every code is Heliaxis's own
// (HX-HO-xx, HX-PV-xx, HX-BAT-xx).
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

// The owner's list, in his order, by Heliaxis's codes.
const OWNER_LIST = ['HX-HO-01', 'HX-BAT-01', 'HX-HO-06', 'HX-PV-02', 'HX-BAT-02', 'HX-PV-01', 'HX-PV-03', 'HX-HO-02', 'HX-BAT-04', 'HX-HO-08', 'HX-HO-15', 'HX-HO-10', 'HX-BAT-03', 'HX-HO-11', 'HX-HO-12', 'HX-HO-16', 'HX-HO-09', 'HX-HO-17', 'HX-HO-13', 'HX-HO-18', 'HX-HO-05', 'HX-HO-04', 'HX-HO-14', 'HX-HO-07', 'HX-HO-03', 'HX-HO-19'];
eq('every document in the owner’s list has a slot', OWNER_LIST.filter((c) => !S.slotDef(c)), []);
eq('26 items plus the combined PACK', [S.PACK_ITEMS.length, S.SLOTS.length], [26, 27]);
eq('titles in Heliaxis’s own words', [S.slotDef('HX-HO-16').title, S.slotDef('HX-HO-07').title, S.slotDef('HX-BAT-04').title, S.slotDef('HX-HO-02').title, S.slotDef('HX-HO-08').title], ['Grid connection papers (G99)', 'Warranty insurance', 'Battery location statement (PAS 63100)', 'System summary and sign-off', 'Completion sign-off']);
eq('every code is Heliaxis’s own', S.PACK_ITEMS.filter((s) => !/^HX-(HO|PV|BAT)-\d\d$/.test(s.code)).map((s) => s.code), []);
eq('every item has a customer line and a contents group', S.PACK_ITEMS.filter((s) => !s.customer || !s.group).map((s) => s.code), []);
eq(
  'pack order is the customer order (HANDOVER 2.6)',
  [...S.PACK_ITEMS].sort((a, b) => a.order - b.order).map((s) => s.code),
  ['HX-HO-01', 'HX-HO-02', 'HX-HO-03', 'HX-HO-04', 'HX-BAT-04', 'HX-HO-05', 'HX-HO-06', 'HX-HO-07', 'HX-HO-08', 'HX-HO-09', 'HX-HO-10', 'HX-HO-11', 'HX-HO-12', 'HX-HO-13', 'HX-HO-14', 'HX-PV-02', 'HX-PV-01', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-BAT-03', 'HX-HO-15', 'HX-HO-16', 'HX-HO-17', 'HX-HO-18', 'HX-HO-19']
);
eq('"Which is it?" ends with Something else; the office’s uploads (the G98 notice, the estimate page, the PAS 63100 papers) are offered', S.UPLOAD_PICKS.map((s) => s.pick), ['MCS certificate', 'Electrical certificate (EIC)', 'Battery location statement (PAS 63100)', 'Building Regulations certificate', 'Warranty insurance policy', 'Solar estimate, shading and care', 'Wiring diagram (schematic)', 'Design calculations', 'Battery location check (PAS 63100)', 'G98 notice as sent', 'G99 papers', 'Final invoice', 'Something else']);

/* ── Applies: technologies and the DNO route ──────────────────────────────── */

const applies = (products, extra = {}) => {
  const c = { products, dnoRoute: 'g98', pas63100: true, maintenancePlan: false, ...extra };
  return Object.fromEntries(S.PACK_ITEMS.map((s) => [s.code, s.applies(c)]));
};
const yes = (m) => Object.keys(m).filter((k) => m[k] === null);
eq(
  'EV only: the covering letter, certificate, Building Regulations, warranty, completion, switching off, manuals, invoice (and the optional extras)',
  yes(applies(['ev'])),
  ['HX-HO-01', 'HX-HO-04', 'HX-HO-05', 'HX-HO-06', 'HX-HO-08', 'HX-HO-09', 'HX-HO-17', 'HX-HO-18', 'HX-HO-19']
);
eq('EV only: the rest say why', [applies(['ev'])['HX-PV-02'], applies(['ev'])['HX-HO-02'], applies(['ev'])['HX-BAT-01'], applies(['ev'])['HX-HO-03']], ['No solar panels on this job', 'No solar or battery on this job', 'No battery on this job', 'No MCS certificate for this job’s technologies']);
eq('heat pump only: MCS certificate and guarantee apply', [applies(['heatpump'])['HX-HO-03'], applies(['heatpump'])['HX-HO-07'], applies(['heatpump'])['HX-HO-02']], [null, null, 'No solar or battery on this job']);
const sb = applies(['solar', 'battery']);
eq('solar + battery, G98, PAS ticked, no plan: G99 and the agreement not needed', [sb['HX-HO-16'], sb['HX-HO-12'], sb['HX-HO-15'], sb['HX-BAT-03']], ['G98 job: the DNO is told after', 'No maintenance plan sold', null, null]);
eq('G99 route: Form B not needed', applies(['solar'], { dnoRoute: 'g99' })['HX-HO-15'], 'G99 job: Form B isn’t used');
eq('demand only / not needed: neither', [applies(['solar'], { dnoRoute: 'demand' })['HX-HO-16'], applies(['battery'], { dnoRoute: 'not_needed' })['HX-HO-15']], ['Demand only: no generation paperwork', 'No DNO paperwork needed on this job']);
eq('no route chosen: both apply (and ask for it)', [applies(['solar'], { dnoRoute: null })['HX-HO-15'], applies(['solar'], { dnoRoute: null })['HX-HO-16']], [null, null]);
eq('PAS 63100 not ticked: the battery location check and statement not needed', [applies(['battery'], { pas63100: null })['HX-BAT-03'], applies(['battery'], { pas63100: false })['HX-BAT-04']], ['PAS 63100 isn’t ticked for this battery (Job details)', 'PAS 63100 isn’t ticked for this battery (Job details)']);
eq('a plan sold: the maintenance plan applies', applies(['solar'], { maintenancePlan: true })['HX-HO-12'], null);

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
const partDocs = ['HX-PV-02', 'HX-PV-01', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-HO-04'].map((c) => doc(c));
const partGen = { 'HX-HO-01': ready('HX-HO-01'), 'HX-HO-02': { ready: false, state: 'missing', why: 'Sign the design part.', fix: 'sign-design' }, 'HX-HO-08': { ready: false, state: 'waiting', why: 'Waiting for Jane to sign.' }, 'HX-HO-11': ready('HX-HO-11'), 'HX-HO-10': { ready: false, state: 'missing', why: 'MIS 3002…', fix: 'upload' }, 'HX-HO-09': ready('HX-HO-09'), 'HX-HO-06': { ready: false, state: 'missing', why: 'Set the warranty…', fix: 'settings' } };
const part = byCode(S.slotStates(ctx({ docs: [...partDocs, doc('HX-HO-01'), doc('HX-HO-11'), doc('HX-HO-09')], gen: partGen })));
eq('site documents in: Complete', ['HX-PV-02', 'HX-PV-01', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-HO-04'].map((c) => part[c].state), ['complete', 'complete', 'complete', 'complete', 'complete', 'complete']);
const waitsDesign = byCode(S.slotStates(ctx({ certWaits: 'Sign the EIC’s design part (Site tab, the electrician’s card): the certificate and the next inspection come from it.' })))['HX-HO-04'];
eq('the EIC made in the app, signed off but its design part not signed: Missing, open the Site tab (it blocks Send)', [waitsDesign.state, waitsDesign.fix, waitsDesign.why.startsWith('Sign the EIC’s design part'), S.SITE_SLOTS.includes('HX-HO-04')], ['missing', 'site', true, true]);
eq('MCS certificate: Waiting, due in 10 working days', [part['HX-HO-03'].state, part['HX-HO-03'].why, part['HX-HO-03'].due], ['waiting', 'Due Tue 17 Nov (10 working days)', '2026-11-17']);
eq('warranty insurance: Waiting until the MCS certificate', [part['HX-HO-07'].state, part['HX-HO-07'].why], ['waiting', 'After the MCS certificate.']);
eq('warranty insurance: Missing once the MCS certificate’s number is saved, or the certificate is uploaded', [byCode(S.slotStates(ctx({ paperwork: { mcs_cert_no: 'MCS-123' } })))['HX-HO-07'].state, byCode(S.slotStates(ctx({ docs: [doc('HX-HO-03', { source: 'upload', key: null })] })))['HX-HO-07'].fix], ['missing', 'upload']);
eq('…with its 7 days once they start', byCode(S.slotStates(ctx({ paperwork: { mcs_cert_no: 'MCS-123', mcs_registered_on: '2026-11-12' }, due: { ...ctx().due, cc16: '2026-11-19' } })))['HX-HO-07'].why, 'Buy the warranty insurance and upload the policy. Due Thu 19 Nov (7 days).');
eq('Building Control: Missing (Heliaxis notifies), due in 30 days', [part['HX-HO-05'].state, part['HX-HO-05'].fix], ['missing', 'notify-bc']);
eq('Building Control by the electrician’s scheme: Waiting for them', byCode(S.slotStates(ctx({ partPBy: 'self' })))['HX-HO-05'].why, 'Waiting for Dave to notify their scheme and send the reference.');
eq('system summary: Missing until the design part is signed', [part['HX-HO-02'].state, part['HX-HO-02'].fix], ['missing', 'sign-design']);
eq('completion sign-off: Waiting for the customer', part['HX-HO-08'].state, 'waiting');
// The G98 notice is done in the office (owner decision 9): an upload of the notice as sent, never the app's data sheet.
eq('G98 notice an office upload, offered on + Add a document: no generated document of its own', [S.slotDef('HX-HO-15').kind, S.slotDef('HX-HO-15').maker, S.UPLOAD_PICKS.some((p) => p.code === 'HX-HO-15')], ['C', 'office', true]);
eq('G98 notice switched on, nothing uploaded: Missing, upload it as sent, due in 28 days', [part['HX-HO-15'].state, part['HX-HO-15'].fix, part['HX-HO-15'].due, part['HX-HO-15'].why], ['missing', 'upload', '2026-12-01', 'Upload the G98 notice as it was sent to the DNO. Due Tue 1 Dec (28 days).']);
eq('G98 notice marked sent, not uploaded: still Missing (the notice as sent goes in the pack)', [byCode(S.slotStates(ctx({ dnoNotified: true })))['HX-HO-15'].state, byCode(S.slotStates(ctx({ dnoNotified: true })))['HX-HO-15'].fix], ['missing', 'upload']);
eq('G98 notice before switching on: Waiting', byCode(S.slotStates(ctx({ commissioned: null })))['HX-HO-15'].state, 'waiting');
eq('G98 notice uploaded as sent: Complete', byCode(S.slotStates(ctx({ docs: [doc('HX-HO-15', { source: 'upload', key: null })] })))['HX-HO-15'].state, 'complete');
eq('not needed: the G99 papers (G98 job), the plan (none sold), the PAS 63100 pair (not ticked)', ['HX-HO-16', 'HX-HO-12', 'HX-BAT-03', 'HX-BAT-04'].map((c) => part[c].state), ['na', 'na', 'na', 'na']);
eq('other useful documents are never Missing and never counted', [part['HX-HO-19'].state, part['HX-HO-19'].counted], ['na', false]);
eq('invoice before the pack goes: Waiting', [part['HX-HO-18'].state, part['HX-HO-18'].why], ['waiting', 'After the handover pack goes.']);
eq('invoice after: Missing, send the final invoice', byCode(S.slotStates(ctx({ sent: true })))['HX-HO-18'].state, 'missing');
eq('invoice uploaded, unpaid: Waiting', byCode(S.slotStates(ctx({ docs: [doc('HX-HO-18', { source: 'upload', key: null })] })))['HX-HO-18'].why, 'Final invoice not paid yet.');
eq('invoice uploaded and paid: Complete', byCode(S.slotStates(ctx({ docs: [doc('HX-HO-18', { source: 'upload', key: null })], invoicePaid: true })))['HX-HO-18'].state, 'complete');
eq('manuals with nothing attached yet: from the library', [part['HX-HO-17'].state, part['HX-HO-17'].fix], ['missing', 'library']);
const gap = byCode(S.slotStates(ctx({ libraryGaps: ['GivEnergy AIO'] })))['HX-HO-17'];
eq('manuals library gap: Missing with the model named', [gap.state, gap.why], ['missing', 'No manual or datasheet for GivEnergy AIO: upload it once and every job with that model gets it.']);
eq('manuals with no models on the job: Missing, add them', byCode(S.slotStates(ctx({ models: [] })))['HX-HO-17'].why, 'Add the product models on Job details.');

const h = S.headline(Object.values(part));
eq('headline: Complete against everything that applies', h.words, `${h.complete} of ${h.total} complete · ${h.waiting} waiting · ${h.missing} missing · ${h.na} not needed`);
eq('headline counts (21 apply: the 26, less G99, the agreement, PAS 63100 twice and the extras)', [h.complete, h.total, h.na], [9, 21, 4]);

// No route chosen: Missing, never silently not needed.
const noRoute = byCode(S.slotStates(ctx({ dnoRoute: null })));
eq('no DNO route: the G98 notice and G99 papers Missing, choose it on Paperwork', [noRoute['HX-HO-15'].state, noRoute['HX-HO-15'].why, noRoute['HX-HO-16'].state, noRoute['HX-HO-15'].fix], ['missing', 'Choose the DNO route on Paperwork.', 'missing', 'paperwork']);

// G99: the papers by part.
const g99 = (docs, extra = {}) => byCode(S.slotStates(ctx({ dnoRoute: 'g99', docs, ...extra })))['HX-HO-16'];
eq('G99 application sent: Waiting for the DNO', g99([], { dnoSubmitted: true }).why, 'Application sent, waiting for the DNO.');
eq('G99 acceptance only: still the installation document', g99([doc('HX-HO-16', { source: 'upload', part: 'acceptance' })]).why, 'Still to upload: the installation document.');
eq('G99 acceptance and installation document: Complete', g99([doc('HX-HO-16', { source: 'upload', part: 'acceptance' }), doc('HX-HO-16', { source: 'upload', part: 'installation' })]).state, 'complete');

// Office marks: Not needed with a reason, and who.
const marked = byCode(S.slotStates(ctx({ marks: { 'HX-HO-14': { na: true, reason: 'No structural or other calculations needed for this design', by: 'Sarah', at: '2026-11-03T10:00:00Z' } } })))['HX-HO-14'];
eq('office Not needed: reason and who', [marked.state, marked.why, marked.office?.by], ['na', 'No structural or other calculations needed for this design', 'Sarah']);

// Out of date: one of ours whose inputs changed after it went to the customer.
const sentF78 = byCode(S.slotStates(ctx({ docs: [doc('HX-HO-02', { visible: true, hash: 'old' })], gen: { 'HX-HO-02': ready('HX-HO-02') } })))['HX-HO-02'];
eq('Out of date: a sent document whose inputs changed', [sentF78.state, sentF78.why], ['stale', 'The details changed after it went to the customer: regenerate it.']);
eq('Complete when the inputs match', byCode(S.slotStates(ctx({ docs: [doc('HX-HO-02', { visible: true })], gen: { 'HX-HO-02': ready('HX-HO-02') } })))['HX-HO-02'].state, 'complete');
const foreign = byCode(S.slotStates(ctx({ docs: [doc('HX-PV-02', { visible: true, stale: true })] })))['HX-PV-02'];
eq('Out of date: another unit’s document marked by the store', foreign.state, 'stale');
eq('Waiting: the electrician still working', byCode(S.slotStates(ctx({ electrician: 'working' })))['HX-PV-02'].why, 'Waiting for Dave (electrician)');
eq('Missing: no electrician on the job', byCode(S.slotStates(ctx({ electrician: 'none' })))['HX-PV-02'].fix, 'site');
eq('all five states seen', [...new Set(Object.values(part).concat(sentF78).map((v) => v.state))].sort(), ['complete', 'missing', 'na', 'stale', 'waiting']);

// The send gate (D23): every site document Complete; the office's can follow.
eq('Send is held while the system summary is missing', [S.sendCheck(Object.values(part)).ok, S.sendCheck(Object.values(part)).blocking.map((v) => v.code)], [false, ['HX-HO-02']]);
eq('…by the office (its design signature), not by site', S.sendCheck(Object.values(part)).blocking.map((v) => [v.code, S.waitsOn(v), v.fix]), [['HX-HO-02', 'office', 'sign-design']]);
// PAS 63100 ticked, the electrician still on site: their documents come from site, the PAS 63100 papers from the office (the app can't make them yet).
const pasJob = S.sendCheck(S.slotStates(ctx({ pas63100: true, electrician: 'working' }))).blocking;
eq('PAS 63100 papers: office uploads, never "waiting for the electrician"', pasJob.filter((v) => v.code === 'HX-BAT-03' || v.code === 'HX-BAT-04').map((v) => [v.code, v.state, v.fix, S.waitsOn(v)]), [['HX-BAT-04', 'missing', 'upload', 'office'], ['HX-BAT-03', 'missing', 'upload', 'office']]);
eq('…while the electrician’s own wait for site', pasJob.filter((v) => ['HX-PV-02', 'HX-BAT-01'].includes(v.code)).map((v) => [v.code, S.waitsOn(v)]), [['HX-PV-02', 'site'], ['HX-BAT-01', 'site']]);
const done = byCode(S.slotStates(ctx({ docs: [...partDocs, doc('HX-HO-02')], gen: { ...partGen, 'HX-HO-02': ready('HX-HO-02') } })));
const sc = S.sendCheck(Object.values(done));
eq('Send allowed once the site documents are in; the rest follow', [sc.ok, sc.following.map((v) => v.code).includes('HX-HO-03')], [true, true]);

// Customer view, pack contents grouping.
eq('portal: a waiting item is "on its way", a not-needed one hidden', [S.customerState(part['HX-HO-03']), S.customerState(part['HX-HO-16']), S.customerState({ ...part['HX-PV-02'], docs: [doc('HX-PV-02', { visible: true })] })], ['coming', null, 'ready']);
const groups = S.contentsGroups(Object.values(part).filter((v) => v.state !== 'na' && v.code !== 'HX-HO-01'));
eq('contents groups in order', groups.map((g) => g.title), ['Certificates', 'Warranties and guarantees', 'Using and looking after your system', 'Design', 'Test and inspection records', 'Grid connection', 'Manufacturer information', 'Invoices']);
eq('certificates in pack order', groups[0].items.map((v) => v.code), ['HX-HO-02', 'HX-HO-03', 'HX-HO-04', 'HX-HO-05']);
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
  electrician: { name: 'Dave Price', company: 'Price Electrical', status: 'done', signedAt: '2026-11-03T17:41:00Z', signedOn: '2026-11-03', signaturePath: 'signatures/p1/site-s1.png', values: { hos_kind: 'initial', eess_backup: 'yes', hos_circuits: '2 PV strings; 1 AC circuit' }, customer: {}, partPBy: 'heliaxis', certRef: 'HX-0042-EIC', nextInspection: null },
  data: { 'HX-HO-02': { design: { name: 'Callum Hughes', signed_at: '2026-11-03T18:00:00Z', path: 'signatures/p1/summary-design.png', by: 'u1' } } },
  library: [],
  payments: [],
  survey: { shading: ['Chimney'], sunPath: null },
  made: ['HX-PV-02', 'HX-PV-01', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02'],
  settings,
  ...over,
});
eq('system summary with no next inspection anywhere: Missing (never a guessed number)', I.summaryInput(facts()).why, 'Set the next inspection (years) in CRM settings: the electrical certificate doesn’t give one.');
const sumOk = I.summaryInput(facts({ settings: { ...settings, nextInspectionYears: 10 } }));
eq('system summary with everything: ready, the standards that apply, the next inspection', [sumOk.ok, sumOk.input?.standards, sumOk.input?.next, sumOk.input?.kind], [true, 'MCS MIS 3002 (solar PV) and MCS MIS 3012 (battery storage)', 'Within 10 years, as Heliaxis recommends', 'initial']);
eq('system summary: the records behind it, by Heliaxis code, with their references and whether they’re in the pack', sumOk.input?.records.map((r) => [r.code, r.ref, r.inPack]), [
  ['HX-HO-04', 'HX-0042-EIC', false],
  ['HX-HO-04', 'HX-0042-EIC', false],
  ['HX-PV-01', 'HX-0042', true],
  ['HX-PV-02', 'HX-0042', true],
  ['HX-PV-03', 'HX-0042', true],
  ['HX-BAT-01', 'HX-0042', true],
  ['HX-BAT-01 and HX-HO-04', 'HX-0042 and HX-0042-EIC', false],
  ['HX-BAT-02', 'HX-0042', true],
  ['HX-BAT-02', 'HX-0042', true],
]);
eq('system summary PV description and circuits from the job', [sumOk.input?.pv?.desc, sumOk.input?.pv?.circuits], ['12 × JA Solar JAM54S30 440 (5.28 kWp), GivEnergy Gen 3 5 kW', '2 PV strings; 1 AC circuit']);
const noClass = I.summaryInput(facts({ design: designOf({ est_kwh_year: 4620, shade_factor: 0.95, battery_kw: 3.6, roof_faces: 'Rear roof' }), settings: { ...settings, nextInspectionYears: 10 } }));
eq('system summary with no system class: Missing, named, nothing printed', [noClass.ok, noClass.why, 'input' in noClass], [false, 'Needs the battery system class on Job details.', false]);
eq('system summary before the electrician signs: Waiting', I.summaryInput(facts({ electrician: { ...facts().electrician, signedAt: null, signaturePath: null } })).state, 'waiting');
const noCircuits = I.summaryInput(facts({ electrician: { ...facts().electrician, values: { hos_kind: 'initial', eess_backup: 'yes' } }, settings: { ...settings, nextInspectionYears: 10 } }));
eq('system summary with no circuits tested (not typed, not on the EIC): Missing, Summary details, never "Not answered"', [noCircuits.ok, noCircuits.fix], [false, 'values']);
eq('system summary with the office’s circuits tested: ready, printed', I.summaryInput(facts({ electrician: { ...facts().electrician, values: { hos_kind: 'initial', eess_backup: 'yes' } }, data: { 'HX-HO-02': { ...facts().data['HX-HO-02'], values: { circuits: '2 PV strings; 1 AC circuit' } } }, settings: { ...settings, nextInspectionYears: 10 } })).input?.pv?.circuits, '2 PV strings; 1 AC circuit');
const eicDesign = { name: 'Sarah Jones', signed_at: '2026-11-04T09:00:00Z', path: 'signatures/p1/eic-design.png', by: 'u2' };
const viaEic = I.summaryInput(facts({ data: {}, electrician: { ...facts().electrician, design: eicDesign }, settings: { ...settings, nextInspectionYears: 10 } }));
eq('system summary with the EIC’s design part signed in the office: one signature, made with it', [viaEic.ok, viaEic.input?.design], [true, eicDesign]);
eq('the summary’s own design signature, if there is one, comes first', I.summaryInput(facts({ electrician: { ...facts().electrician, design: eicDesign }, settings: { ...settings, nextInspectionYears: 10 } })).input?.design?.name, 'Callum Hughes');
eq('system summary without the design signature: Sign the design part', I.summaryInput(facts({ data: {}, settings: { ...settings, nextInspectionYears: 10 } })).fix, 'sign-design');

const sched = I.scheduleInput(facts());
eq('maintenance schedule with no interval prints the manufacturer line', sched.input.rows.filter((r) => r.item.startsWith('Battery')).map((r) => r.often), [I.MANUAL_SAYS]);
eq('maintenance schedule electrical row follows the EIC when it has no figure', sched.input.rows[0].often, 'As your Electrical Installation Certificate says');
const withInterval = I.scheduleInput(
  facts({ library: [{ id: 'l1', name: 'GivEnergy manual', kind: 'manual', models: ['GivEnergy 9.5 kWh'], slot: 'HX-HO-17', technologies: ['battery'], every_pack: false, details: { 'GivEnergy 9.5 kWh': { interval: { every: 'Every 12 months', source: 'GivEnergy installation manual 4.2' } } }, storage_path: 'library/x.pdf', compact_path: null, mime: 'application/pdf', size: 1 }] })
);
eq('maintenance schedule interval from the library, with its source', withInterval.input.rows.find((r) => r.item.startsWith('Battery')), { item: 'Battery (GivEnergy 9.5 kWh)', check: 'Check it’s charging and discharging in the app', who: 'You', often: 'Every 12 months', source: 'GivEnergy installation manual 4.2' });

eq('estimate page: never made until MIS 3002’s wording is copied in', [I.shadingInput(facts()).ok, I.shadingInput(facts()).fix], [false, 'upload']);
eq('estimate page: no design figures, Missing (the handover never works one out)', I.shadingInput(facts({ design: designOf({}) })).why, 'Add the estimated generation and the shade factor from the design on Job details.');
eq('estimate page: with verified wording (fixture), ready', I.shadingInput(facts(), { source: 'MIS 3002', issue: 'test', verified: true, importantNote: 'FIXTURE', shadingNote: 'FIXTURE 2' }).ok, true);

eq('workmanship warranty: no term set, Missing, upload your own', [I.warrantyInput(facts()).ok, I.warrantyInput(facts()).fix], [false, 'settings']);
const w = I.warrantyInput(facts({ settings: { ...settings, warrantyYears: 10, warrantyStart: 'commissioning', warrantyText: 'Our wording.' } }));
eq('workmanship warranty: term, start and wording set, dated from switching on; policy to follow', [w.ok, w.input.start, w.input.backedBy], [true, '2026-11-03', null]);

eq('completion sign-off: Waiting for the customer to sign', I.completionInput(facts()).why, 'Waiting for Jane to sign (on the electrician’s phone or in their portal).');
const sig = { name: 'Jane Smith', signed_at: '2026-11-03T17:50:00Z', path: 'signatures/p1/site-s1-cust-completion.png', via: 'phone' };
eq('completion sign-off: signed on the phone, ready', I.completionInput(facts({ electrician: { ...facts().electrician, customer: { completion: sig } } })).ok, true);

eq('G98 data sheet: no MPAN, Missing', I.g98Input(facts({ system: { ...facts().system, mpan: null } })).why, 'Add the MPAN on Job details.');
eq('switching off: no switch locations, Missing and named', I.switchInput(facts()).why, 'Say where the switches are: consumer unit circuit, ac isolator, dc isolator and battery isolator.');
const sw = I.switchInput(facts({ data: { 'HX-HO-09': { values: { cu: 'Hall, labelled Solar PV', ac: 'Loft, by the inverter', dc: 'Built into the inverter', battery: 'Side of the battery' } } } }));
eq('switching off: back-up warning on a back-up job', [sw.ok, sw.input.steps.some((s) => s.includes('back-up power'))], [true, true]);
// The steps the job has, numbered 1…n, and back on from n (a customer's safety instruction).
const SWITCHES = { cu: 'Hall', ac: 'Loft', dc: 'Inverter', battery: 'Battery side' };
const order = (products) => {
  const s = I.switchInput(facts({ job: { ...facts().job, products }, data: { 'HX-HO-09': { values: SWITCHES } } })).input.steps;
  return [s.filter((l) => /^\d\./.test(l)).map((l) => l.slice(0, 2)), s.find((l) => l.startsWith('To switch it back on'))];
};
eq('switching off, solar + battery: 1–4, back on 4, 3, 2, then 1', order(['solar', 'battery']), [['1.', '2.', '3.', '4.'], 'To switch it back on, go the other way: 4, 3, 2, then 1.']);
eq('solar only: 1–3, back on from 3', order(['solar']), [['1.', '2.', '3.'], 'To switch it back on, go the other way: 3, 2, then 1.']);
eq('battery only: its isolator is step 3, back on from 3', [order(['battery']), I.switchInput(facts({ job: { ...facts().job, products: ['battery'] }, data: { 'HX-HO-09': { values: SWITCHES } } })).input.steps[2]], [[['1.', '2.', '3.'], 'To switch it back on, go the other way: 3, 2, then 1.'], '3. Battery: switch it off at its own isolator, as its manual shows: Battery side.']);
eq('EV only: 1 and 2, back on 2, then 1', order(['ev']), [['1.', '2.'], 'To switch it back on, go the other way: 2, then 1.']);

const rec = I.receiptInput(facts({ payments: [{ id: 'x1', kind: 'final', amount_pence: 512345, paid_on: '2026-11-10', method: 'bank_transfer', reference: 'INV-0042' }] }));
eq('receipt: exactly the recorded payments (the deposit, then the final), nothing worked out', rec.input.lines.map((l) => [l.what, l.pence]), [['Deposit', 50000], ['Final payment', 512345]]);
eq('receipt: nothing recorded, nothing made', I.receiptInput(facts({ job: { ...facts().job, deposit: { amount: 500, paidAt: null, ref: null } } })).ok, false);

const cover = I.coverInput(facts(), Object.values(part));
eq('cover letter: what to follow says so', cover.input.contents.find((g) => g.group === 'Certificates').items.find((i) => i.title === 'MCS certificate').status, 'To follow: we register it with MCS within 10 working days of switching your system on');
eq('cover letter: installed in plain words', cover.input.installed, ['12 × JA Solar JAM54S30 440 solar panels (5.28 kWp)', 'GivEnergy Gen 3 5 kW inverter (5 kW)', 'GivEnergy 9.5 kWh battery (9.5 kWh usable)']);
eq('cover letter: not approved, not made', I.coverInput(facts({ settings: H.DEFAULT_HANDOVER_SETTINGS }), []).fix, 'settings');
eq('MID copy fields in order', I.midFields(facts()).slice(0, 4).map((x) => x.label), ['Installation address', 'Customer', 'Commissioning date', 'MPAN']);
eq('install days in words', [I.daysWords(['2026-11-02', '2026-11-03']), I.daysWords(['2026-10-30', '2026-11-02', '2026-11-03'])], ['2 and 3 November 2026', '30 October to 3 November 2026']);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
