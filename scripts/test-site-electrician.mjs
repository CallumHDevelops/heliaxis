// The electrician's pack (src/lib/site/forms/electrician/*, Unit 2): which sections each mix of
// technologies gets; prefill from the roofer and the design (offered, never filled in; measured
// boxes empty); the completion gate (every must, EF1 and EF3, the certificate through its registry);
// the flags of FORMS 5.3; expected Voc, F44 item 24, Table 2 and the back-up rules; the worked-out
// ticks (F44 36–38, F44A); then the PDFs (F43, F44, F44A, F74, F75, the EV and heat pump records:
// titles, codes, every answer, the footer on every page, ticks drawn, F74's tests also on F75, a
// seventh string starting a new block); and last a sign-off through the real route against an
// in-memory database: one PO, commissioned, on to Paperwork & handover, the deadline tasks, the
// handover call for the next working day (Friday → Monday, over a bank holiday), the monitoring
// task, the DNO to-do for an EV charger, the paperwork stored in its handover items, and three sends
// making one of everything.
// Usage: node --experimental-strip-types scripts/test-site-electrician.mjs
import { createHash, randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
// Everything outside the site code that would reach Supabase, Next, Resend, Meta or the CRM is stood
// in for, recording what it was asked to do (globalThis.__rec).
const STUBS = {
  'server-only': 'export {}',
  'next/server': `
    export class NextResponse extends Response {
      static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } }); }
    }
    export function after(fn) { globalThis.__after.push(fn); }`,
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.__db;',
  '@/lib/crm/server': `
    export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos'; export const NO_STORE = {};
    export const thumbPath = (p) => p.replace(/\\.[a-z0-9]+$/i, '') + '.thumb.jpg';
    export const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);
    export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }
    export async function logActivity(a) { globalThis.__rec.activity.push(a); }
    export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });`,
  '@/lib/notify': 'export async function notify(n) { globalThis.__rec.notify.push(n); }',
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, purchaseOrders: true, handover: false }; }',
  '@/lib/surveys/server': `
    export async function addSourceTask(db, t) { if (globalThis.__rec.tasks.some((x) => x.key === t.key)) return false; globalThis.__rec.tasks.push(t); return true; }
    export async function closeSourceTask() {}`,
  '@/lib/crm/move-stage': 'export async function applyStageEvent(id, event, o) { globalThis.__rec.stage.push({ id, event, note: o?.note }); return { moved: true, from: "installing" }; }',
  '@/lib/projects/server': 'export async function ensureDeadlineTasks(id) { globalThis.__rec.deadlines.push(id); return 0; }',
  '@/lib/purchase-orders/server': 'export async function logOrder(db, o, event, body) { globalThis.__rec.orders.push({ event, body }); }',
  '@/lib/whatsapp/settings': 'export async function getSettings() { return { quietFromMin: 1260, quietToMin: 525, lateRule: false, lateFromMin: 1230, lateSendAtMin: 420 }; }',
  '@/lib/whatsapp/api': `
    export const whatsappConfigured = () => true; export const defaultTemplate = () => ({ lang: 'en_GB' });
    export async function sendTemplate(to, name, lang, params) { globalThis.__rec.whatsapp.push({ to, name, params }); return { ok: true, data: { messages: [{ id: 'wamid.' + globalThis.__rec.whatsapp.length }] } }; }`,
  '@/lib/whatsapp/templates': `export async function fetchTemplates() { return { ok: true, items: ['site_job_pack', 'site_po_raised'].map((name) => ({ name, status: 'APPROVED' })) }; }`,
  '@/lib/subcontractors/server': `
    import { createHash, randomBytes } from 'node:crypto';
    export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
    export const newToken = () => randomBytes(24).toString('base64url');
    export const portalBaseUrl = (o) => (o || 'http://localhost:3000').replace(/\\/$/, '');
    export const clientIp = () => '203.0.113.7';
    export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    export const emailShell = (title, body) => '<h1>' + title + '</h1>' + body;
    export function validSignature(sig) { return typeof sig === 'string' && /^data:image\\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 300000; }
    export async function sendEmail(m) { globalThis.__rec.email.push(m); return { ok: true, id: 'resend-' + globalThis.__rec.email.length }; }`,
};
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

// The clock, when a test says so (the handover call's day depends on it), and gov.uk's bank holidays.
const RealDate = Date;
let fixed = null;
globalThis.Date = class extends RealDate {
  constructor(...a) {
    if (!a.length && fixed !== null) super(fixed);
    else super(...a);
  }
  static now() {
    return fixed ?? RealDate.now();
  }
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) =>
  String(u).includes('gov.uk/bank-holidays') ? new Response(JSON.stringify({ 'england-and-wales': { events: [{ date: '2026-12-25' }, { date: '2026-12-28' }] } }), { headers: { 'content-type': 'application/json' } }) : realFetch(u, init);

const F = await import('../src/lib/site/forms/index.ts');
const R = await import('../src/lib/site/rules.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const CERT = await import('../src/lib/site/forms/electrician/cert.ts');
const F43 = await import('../src/lib/site/forms/electrician/f43.ts');
const F44 = await import('../src/lib/site/forms/electrician/f44.ts');
const EESS = await import('../src/lib/site/forms/electrician/eess.ts');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const X = await import('./site-electrician-fixtures.mjs');
const { SYSTEM, DESIGN, ROOFER, PER, wrap, facts, textOf: textIn, flat } = X;
const { ctxOf, formFor, fillAll, input } = X.makeFixtures({ R, F, designOf });
const textOf = (bytes) => textIn(pdfjs, bytes);

/* ── Sections by technology (SPEC 5.1, Unit 2 acceptance) ───────────────────── */
const steps = (products, design) => formFor(products, design).steps.map((s) => s.key);
eq('solar only: F43, F44, F44A and no battery sections', steps(['solar']), ['photos', 'serials', 'f43', 'f44', 'f44a', 'f78', 'eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign', 'cert-own', 'cert', 'finish']);
eq('battery only: F74 with no F43', steps(['battery']), ['photos', 'serials', 'f74', 'f74t', 'f78', 'eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign', 'cert-own', 'cert', 'finish']);
eq('solar + battery: both', steps(['solar', 'battery']), ['photos', 'serials', 'f43', 'f44', 'f44a', 'f74', 'f74t', 'f78', 'eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign', 'cert-own', 'cert', 'finish']);
eq('battery with PAS 63100: the battery location check', steps(['battery'], { ...DESIGN, pas63100: true }).includes('battery-location'), true);
eq('EV only: the EV record and the certificate', steps(['ev']), ['photos', 'serials', 'ev', 'eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign', 'cert-own', 'cert', 'finish']);
eq('heat pump only: the supply record and the certificate', steps(['heatpump']), ['photos', 'serials', 'heatpump', 'eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign', 'cert-own', 'cert', 'finish']);
eq('the certificate and Finish are there even if unticked', F.schemaFor({ trade: 'electrician', forms: ['photos'] })[0].steps.map((s) => s.key), ['photos', 'eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-existing', 'eic-extent', 'eic-sign', 'cert-own', 'cert', 'finish']);
const shownSteps = (products, el) => formFor(products).steps.filter((s) => R.stepShown(s, ctxOf(products, {}, {}, el))).map((s) => s.key);
eq('own certificate: its upload step shows, the waiting one doesn’t', shownSteps(['solar'], { cert_route: 'own' }).filter((k) => k.startsWith('cert')), ['cert-own']);
eq('EIC in the app: its screens, no upload and no waiting step', [shownSteps(['solar'], { cert_route: 'eic' }).filter((k) => k.startsWith('cert')), shownSteps(['solar'], { cert_route: 'eic' }).filter((k) => k.startsWith('eic-'))], [[], ['eic-cert', 'eic-supply', 'eic-origin', 'eic-inspect', 'eic-boards', 'eic-instruments', 'eic-extent', 'eic-sign']]);
eq('own certificate: of the EIC only “Which certificate?” shows', shownSteps(['solar'], { cert_route: 'own' }).filter((k) => k.startsWith('eic-')), ['eic-cert']);

/* ── Prefill: offered with a chip, never filled in; measured boxes empty ─────── */
const sb = formFor(['solar', 'battery']);
const c0 = ctxOf(['solar', 'battery']);
const field = (key) => sb.steps.flatMap((s) => s.fields).find((f) => f.key === key);
const offer = (key, c = c0) => {
  const s = field(key).suggest?.(c);
  return s ? [s.src, s.v] : null;
};
eq('F43 strings from the roofer', offer('f43_strings'), ['roofer', 2]);
eq('panels per string from the roofer: 8 + 8', offer('f43_qty'), ['roofer', [8, 8]]);
eq('the module from the roofer, for every string', offer('f43_module'), ['roofer', ['Aiko Neostar 2P 450W', 'Aiko Neostar 2P 450W']]);
eq('Voc as specified: calculated 8 × 49.4 V', offer('f43_spec_voc'), ['calc', [395.2, 395.2]]);
eq('Isc as specified: read from the roofer’s badge photo', offer('f43_spec_isc'), ['photo', [13.92, 13.92]]);
eq('instruments from their last job', offer('f43_instruments'), ['last', 'Megger MFT1741+ s/n 1234567']);
eq('back-up from the design', offer('eess_backup'), ['design', 'no']);
eq('nothing is filled in by itself', ['f43_strings', 'f43_qty', 'f43_module', 'f43_spec_voc'].map((k) => c0.values[k]), [undefined, undefined, undefined, undefined]);
const measured = ['f43_test_voc', 'f43_test_isc', 'f43_ir_pos', 'f43_ir_neg', 'f43_polarity', 'f43_earth_cont', 'f43_iso_func', 'f43_inv_func', 'EP26r', 'hp_ir_le', 'ev_ra', ...EESS.EESS_ROWS.map((r) => r.key)];
eq('measured values and tests are never offered', measured.filter((k) => sb.steps.concat(formFor(['ev', 'heatpump']).steps).flatMap((s) => s.fields).find((f) => f.key === k)?.suggest?.(c0)), []);
eq('no expected Voc with optimisers', F43.expectedVoc(ctxOf(['solar'], {}, {}, { roofer: { ...facts().roofer, values: { ...ROOFER, RF7: 'yes' } } }), 0), null);
eq('expected Voc beside the measured box', field('f43_test_voc').stringNote(c0, 0), 'Expected about 395.2 V (8 × 49.4 V)');
eq('F43 description from the job', field('f43_desc').suggest(c0).v, 'New 7.2 kWp solar PV array: 16 × Aiko Neostar 2P 450W in 2 strings, Sigenergy SigenStor EC 6.0 SP');

/* ── The gate (EF0 and the server's at sign-off) ───────────────────────────── */
const full = fillAll(sb, ['solar', 'battery']);
const cFull = ctxOf(['solar', 'battery'], full.values, full.photos);
const check = R.signCheck(sb, cFull);
eq('everything answered: nothing missing, no Stop', [check.must.map((m) => m.key), check.stops.map((f) => f.code)], [[], []]);
const without = (keys) => {
  const v = { ...full.values };
  for (const k of keys) delete v[k];
  return R.signCheck(sb, ctxOf(['solar', 'battery'], v, full.photos));
};
eq('EF1 unticked: Finish stays grey with the reason', without(['EF1']).must.map((m) => [m.key, m.step]), [['EF1', 'finish']]);
eq('EF3 unticked: the same', without(['EF3']).must.map((m) => m.key), ['EF3']);
eq('the gate lists a row in its own words (an EV job is asked about the charger)', R.signCheck(formFor(['ev']), ctxOf(['ev'], {}, {})).must.find((m) => m.key === 'EF1')?.label, 'Is the charger commissioned?');
eq('a test row missing blocks it too', without(['eess_t_04']).must.map((m) => m.key), ['eess_t_04']);
eq('a photo short blocks it', R.signCheck(sb, ctxOf(['solar', 'battery'], full.values, { ...full.photos, EP07: 2 })).must.map((m) => [m.key, m.why]), [['EP07', '2 of 3 photos']]);
const onEic = (() => {
  const v = { ...full.values };
  delete v.eic_route;
  return ctxOf(['solar', 'battery'], v, full.photos, { cert_route: 'eic' });
})();
eq('the EIC route: the in-app certificate is required (its boards, instruments and signatures)', ['eic_route', 'eic_earthing', 'eic_db', 'eic_inst', 'eic_sig_con', 'eic_sig_ins'].filter((k) => !R.signCheck(sb, onEic).must.some((m) => m.key === k)), []);
eq('…and F44 item 38 then isn’t ticked for them', R.valueOf(field('f44_38'), onEic), undefined);
eq('the electrician switching to their own certificate is asked why', R.signCheck(sb, ctxOf(['solar', 'battery'], full.values, full.photos, { cert_route: 'eic' })).must.map((m) => m.key), ['eic_route_why']);
eq('the own certificate needs its file ("Not added yet", not a photo count)', R.signCheck(sb, ctxOf(['solar', 'battery'], full.values, { ...full.photos, CERT_FILE: 0 })).must.map((m) => [m.key, m.why]), [['CERT_FILE', 'Not added yet']]);
eq('EF2 Not possible needs the why', R.signCheck(sb, ctxOf(['solar', 'battery'], { ...full.values, EF2: 'not_possible' }, full.photos)).must.map((m) => m.key), ['EF2n']);
const ef2 = R.flagsFor(sb, ctxOf(['solar', 'battery'], { ...full.values, EF2: 'not_possible', EF2n: 'No Wi-Fi in the garage' }, full.photos));
eq('…and with it a Review flag for the office', ef2.filter((f) => f.code === 'EF2').map((f) => [f.severity, f.text]), [['review', 'Not on the customer’s internet: No Wi-Fi in the garage. Set up the monitoring remotely']]);

/* The certificate made in the app (Unit 3) is registered for its three routes: done and ref come through the registry. */
eq('every route is ready, and new electricians default to the EIC in the app', [['eic', 'eic_single', 'meiwc', 'own'].map(CERT.certRouteReady), CERT.defaultCertRoute()], [[true, true, true, true], 'eic']);
const eicRef = { ...ctxOf(['solar'], {}, {}, { cert_route: 'eic' }), eic: { route: 'eic', ref: 'HX-0042-EIC', client: null, contact: { name: '' }, instruments: {} } };
eq('…its done and ref are read through the registry', [CERT.certDone(eicRef), CERT.certRef(eicRef), CERT.certRef(cFull)], [false, 'HX-0042-EIC', 'NAPIT EIC 00123456']);

/* ── Worked-out ticks: F44 36–38 and F44A ───────────────────────────────────── */
eq('item 36: the job has a DNO route and reference', R.valueOf(field('f44_36'), cFull), 'done');
eq('…not without the reference', R.valueOf(field('f44_36'), ctxOf(['solar'], full.values, full.photos, { dno_ref: null })), undefined);
eq('item 37: F43 complete', R.valueOf(field('f44_37'), cFull), 'done');
eq('…not while a reading is missing', R.valueOf(field('f44_37'), ctxOf(['solar', 'battery'], { ...full.values, f43_test_isc: [12.7, null] }, full.photos)), undefined);
eq('item 38: the certificate (own: number and file) complete', R.valueOf(field('f44_38'), cFull), 'done');
eq('un-ticked by the electrician: stays off', R.valueOf(field('f44_37'), ctxOf(['solar', 'battery'], { ...full.values, f44_37: 'off' }, full.photos)), undefined);
eq('F44A: inverter started from EF1, monitoring from EF2, meter from Serials, no export limit N/A', ['f44a_1', 'f44a_3', 'f44a_5', 'f44a_6'].map((k) => R.valueOf(field(k), cFull)), ['done', 'na', 'done', 'done']);
eq('F44A monitoring when it wasn’t possible: a cross', R.valueOf(field('f44a_6'), ctxOf(['solar'], { ...full.values, EF2: 'not_possible' }, full.photos)), 'problem');

/* ── Flags (FORMS 5.3) and the worked values ─────────────────────────────────── */
const flagsWith = (patch, products = ['solar', 'battery'], el = {}) => R.flagsFor(products.length === 2 ? sb : formFor(products), ctxOf(products, { ...full.values, ...patch }, full.photos, el)).map((f) => [f.code, f.severity]);
eq('a careful job raises nothing', flagsWith({}).filter(([c]) => c !== 'F78_OFFICE'), []);
eq('polarity Fail: Stop until explained', flagsWith({ f43_polarity: ['pass', 'fail'] }).filter(([c]) => c === 'F43_POL'), [['F43_POL', 'stop']]);
eq('…explained: Urgent', flagsWith({ f43_polarity: ['pass', 'fail'], f43_failn: 'Swapped at the isolator and retested' }).filter(([c]) => c === 'F43_POL'), [['F43_POL', 'urgent']]);
eq('isolator or inverter functional Fail: Stop', flagsWith({ f43_iso_func: ['fail', 'pass'], f43_inv_func: ['pass', 'fail'] }).filter(([c]) => /F43_(ISO|INV)/.test(c)), [['F43_ISO', 'stop'], ['F43_INV', 'stop']]);
eq('insulation below the (unverified) minimum: Review, check against BS EN IEC 62446-1', flagsWith({ f43_ir_pos: [0.4, '>999'] }).filter(([c]) => c === 'F43_IR'), [['F43_IR', 'review']]);
const voc = R.flagsFor(sb, ctxOf(['solar', 'battery'], { ...full.values, f43_test_voc: [346.1, 395.5] }, full.photos)).find((f) => f.code === 'F43_VOC');
eq('Voc off by more than the tolerance: Review, "looks one panel short"', [voc?.severity, voc?.text], ['review', 'String 1: 346.1 V measured, about 395.2 V expected. Looks one panel short']);
eq('identical strings more than 5% apart', flagsWith({ f43_test_voc: [372, 395.5] }).filter(([c]) => c === 'F43_EVEN'), [['F43_EVEN', 'review']]);
eq('F43 strings not the roofer’s', flagsWith({ f43_strings: 3, f43_qty: [8, 8, 8] }).some(([c]) => c === 'F43_STR'), true);
eq('F44 ✗: Urgent', flagsWith({ f44_14: 'problem', f44_14n: 'Gap at the cable entry' }).filter(([c]) => c === 'F44_14'), [['F44_14', 'urgent']]);
eq('F44 N/A on a row that doesn’t allow it: Review; on one that does, nothing', [flagsWith({ f44_09: 'na' }).filter(([c]) => c.startsWith('F44_9')), flagsWith({ f44_17: 'na' }).filter(([c]) => c.startsWith('F44_17'))], [[['F44_9_NA', 'review']], []]);
eq('item 24: the limit is the highest string Voc × 1.25', F44.item24(cFull).limit, 494);
eq('…a 400 V isolator is below it: Urgent', flagsWith({ f43_iso_v: [400, null] }).filter(([c]) => c === 'F44_24'), [['F44_24', 'urgent']]);
eq('…no limit with optimisers', F44.item24(ctxOf(['solar'], full.values, full.photos, { roofer: { ...facts().roofer, values: { ...ROOFER, RF7: 'yes' } } })).limit, null);
eq('Table 2: a) and b) together is a Stop', flagsWith({ f44_t2: ['a', 'b'] }).filter(([c]) => c === 'F44_T2'), [['F44_T2', 'stop']]);
eq('Table 2: d) with another is a Stop', flagsWith({ f44_t2: ['c', 'd'] }).filter(([c]) => c === 'F44_T2'), [['F44_T2', 'stop']]);
eq('Table 2: a), b) or c) asks for the array frame earth photo', ['a', 'b', 'c', 'd'].map((x) => R.missing(sb, ctxOf(['solar', 'battery'], { ...full.values, f44_t2: [x] }, full.photos)).must.some((m) => m.key === 'EP25')), [true, true, true, false]);
eq('F74 Part 1 ✗: Urgent', flagsWith({ f74_1_23: 'problem' }).filter(([c]) => c === 'F74_23'), [['F74_23', 'urgent']]);
eq('F74 Part 2 tests not carried out: Urgent', flagsWith({ f74_2_tests: 'no' }).filter(([c]) => c === 'F74_2_TESTS'), [['F74_2_TESTS', 'urgent']]);
eq('a battery test failed: Urgent', flagsWith({ eess_t_05: 'fail' }).filter(([c]) => c === 'EESS_t_05'), [['EESS_t_05', 'urgent']]);
eq('battery not communicating: Review', flagsWith({ eess_t_02: 'na' }).filter(([c]) => c === 'EESS_NET'), [['EESS_NET', 'review']]);
eq('a duplicate serial in the pack: Review', flagsWith({ SN_BINV: [{ ...full.values.SN_INV[0] }] }).filter(([c]) => c === 'SN_DUP'), [['SN_DUP', 'review']]);
const read = (key, model) => ({ key, status: 'read', result: { readable: true, problem: null, kind: 'inverter', make: null, model, serials: [], panel: null, battery: null, inverter: null, meter: null } });
const withRead = (r) => R.flagsFor(sb, { ...cFull, reads: [r] }).map((f) => [f.code, f.severity]);
eq('the inverter label isn’t the design’s model: Urgent', withRead(read('EP21', 'GivEnergy GIV-HY5.0')).filter(([c]) => c === 'SN_INV_MODEL'), [['SN_INV_MODEL', 'urgent']]);
eq('…the same model, loosely: nothing', withRead(read('EP21', 'SigenStor EC 6.0 SP')).filter(([c]) => c === 'SN_INV_MODEL'), []);
eq('a label that couldn’t be read: Review', flagsWith({ SN_BAT: [{ s: '', src: 'photo', unread: true }] }).filter(([c]) => c === 'SN_BAT_UNREAD'), [['SN_BAT_UNREAD', 'review']]);

/* ── The battery's back-up rules ─────────────────────────────────────────────── */
const noBk = ctxOf(['battery'], { eess_backup: 'no' });
const bat = formFor(['battery']);
const visible = (c) => R.allVisible(bat, c).map(({ f }) => f.key);
eq('no back-up: the changeover tests and EP36 aren’t asked', ['eess_a_05', 'eess_a_06', 'EP36'].map((k) => visible(noBk).includes(k)), [false, false, false]);
eq('…and the back-up rows offer one tap for N/A (never pre-answered)', [bat.steps.flatMap((s) => s.fields).find((f) => f.key === 'f74_1_17').bulk.when(noBk), noBk.values.f74_1_17], [true, undefined]);
const bk = ctxOf(['battery'], { eess_backup: 'yes' });
eq('back-up: the changeover tests, EP36, the electrode photo and its reading', ['eess_a_05', 'eess_a_06', 'eess_a_06_ra', 'EP36', 'EP37'].map((k) => visible(bk).includes(k)), [true, true, true, true, true]);
const fb = fillAll(bat, ['battery'], {}, { eess_backup: 'no' });
const batFlags = (patch) => R.flagsFor(bat, ctxOf(['battery'], { ...fb.values, ...patch }, fb.photos)).map((f) => f.code);
eq('no back-up but back-up rows ticked done: Review', batFlags({ f74_1_19: 'done' }).includes('EESS_BACKUP'), true);
eq('back-up but its rows N/A: Review', batFlags({ eess_backup: 'yes', f74_1_17: 'na' }).includes('EESS_BACKUP'), true);

/* ── The PDFs ─────────────────────────────────────────────────────────────────── */
const D = {
  f43: await import('../src/lib/documents/site/f43.ts'),
  f44: await import('../src/lib/documents/site/f44.ts'),
  f74: await import('../src/lib/documents/site/f74.ts'),
  rec: await import('../src/lib/documents/site/records.ts'),
};
const footerEvery = (pages, code, rev) => pages.every((p, i) => p.replace(/\s+/g, ' ').includes(`${code} · ${rev} · Page ${i + 1} of ${pages.length}`) && p.includes('Registered in England and Wales No. 16734783'));
const OUT = process.env.PDF_OUT;
const keep = async (name, bytes) => OUT && (await import('node:fs')).writeFileSync(`${OUT}/${name}.pdf`, bytes);

const docs = {};
for (const [name, make] of [
  ['F43', D.f43.makeF43],
  ['F44', D.f44.makeF44],
  ['F44A', D.f44.makeF44A],
  ['F74', D.f74.makeF74],
  ['F75', D.f74.makeF75],
]) {
  const bytes = await make(input(cFull));
  await keep(name, bytes);
  docs[name] = await textOf(bytes);
}
const t = Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, flat(v)]));
eq('titles and codes', [t.F43.includes('PV Array Test Report') && t.F43.includes('F43 · PROJECT HX-0042'), t.F44.includes('Solar PV Installation Checklist'), t.F44A.includes('Solar PV Commissioning Checklist'), t.F74.includes('Battery Storage Inspection and Commissioning Checklist'), t.F75.includes('Battery Storage Commissioning Checklist')], [true, true, true, true, true]);
eq('the footer on every page, with the revision', [footerEvery(docs.F43, 'F43', 'Rev 2'), footerEvery(docs.F44, 'F44', 'Rev 2'), footerEvery(docs.F44A, 'F44A', 'Rev 1'), footerEvery(docs.F74, 'F74', 'Rev 1'), footerEvery(docs.F75, 'F75', 'Rev 1')], [true, true, true, true, true]);
eq('"Not answered" nowhere on a finished document', Object.values(t).some((x) => x.includes('Not answered')), false);
eq('ticks and crosses are drawn, never a glyph', Object.values(t).some((x) => /[✓✗✔✘]/.test(x)), false);
eq('no Easy MCS anywhere', Object.values(t).some((x) => /easy\s*mcs/i.test(x)), false);
eq('F43: the answers (strings, readings, the inverter, instruments)', ['Aiko Neostar 2P 450W', '394.8 V', '396.1 V', '>999', '500', 'Built into inverter', 'Sigenergy SigenStor EC 6.0 SP', '110B6002SP0001', 'Megger MFT1741+ s/n 1234567', 'Initial verification', 'N/A', 'Pass'].filter((x) => !t.F43.includes(x)), []);
eq('F43: the merge fields', ['HX-0042', '12 High Street, Maindee, Newport, NP20 4AB', 'Sam Sparks', '3 November 2026'].filter((x) => !t.F43.includes(x)), []);
eq('F43: the inspector’s signature line', t.F43.includes('Signed on the Heliaxis app, 3 Nov 2026 17:41'), true);
eq('F44: every row’s wording, corrected (placed, disconnector)', F44.F44_ROWS.filter((r) => !t.F44.includes(r.label.slice(0, 40))).map((r) => r.n), []);
eq('F44: no source typos printed', ['place out of reach', 'disconnect or fitted', 'electronically conducting'].filter((x) => t.F44.includes(x)), []);
eq('F44: item 20’s roof, Table 2 and its notes exactly', [t.F44.includes('This roof: Pitched Roof'), t.F44.includes('d) Neither a), b), nor c) apply'), t.F44.includes('NOTE 2: when considering a) and b) array frames cannot be both')], [true, true, true]);
eq('F74 and F75: every test answered once, printed on both', EESS.EESS_ROWS.filter((r) => !(t.F74.includes(r.title) && t.F75.includes(r.title))).map((r) => r.key), []);
eq('F74: Parts 1 to 4, the maker’s reference, Part 2 references', ['PART 1: SYSTEM INSPECTION', 'PART 2: TESTS ACCORDING TO BS 7671', 'PART 3: EQUIPMENT AND SYSTEM TESTS', 'PART 4: APPLICATION TESTS', 'Manufacturer’s commissioning test report/schedule reference(s)', 'Answer for f74_2_refs'].filter((x) => !t.F74.includes(x)), []);
eq('F74 typos corrected (suitably, external, correct function, manner)', ['Conductors suitably selected', 'any external influences', 'prove the correct function'].filter((x) => !t.F74.includes(x)), []);
eq('F75 has its own headings and not F74’s extras', [t.F75.includes('Equipment and systems test'), t.F75.includes('Application tests'), t.F75.includes('Manufacturer’s commissioning')], [true, true, false]);
eq('F74: no back-up rows print N/A with why', t.F74.includes('No back-up on this battery.'), true);

// More than six strings: a new block from the seventh (the form's six columns).
const eight = ctxOf(['solar'], { ...full.values, f43_strings: 8, ...Object.fromEntries(Object.keys(PER).map((k) => [k, Array.from({ length: 8 }, (_, i) => PER[k](i % 3))])) }, full.photos);
const t8 = flat(await textOf(await D.f43.makeF43(input(eight))));
eq('eight strings: strings 1 to 6, then 7 to 8', [t8.includes('Strings 1 to 6'), t8.includes('Strings 7 to 8')], [true, true]);

// The EV and heat pump records: the questions asked, with their answers.
const ev = formFor(['ev']);
const fe = fillAll(ev, ['ev']);
const evText = flat(await textOf(await D.rec.makeEvRecord(input(ctxOf(['ev'], fe.values, fe.photos)))));
await keep('EV', await D.rec.makeEvRecord(input(ctxOf(['ev'], fe.values, fe.photos))));
eq('EV record: title, earthing, open-PEN, RCD, demand vs fuse, smart charging, DNO route', ['EV Charge Point Installation Record', 'TN-C-S (PME)', 'Device in the charger', 'Type A RCD, 6 mA DC detection (RDC-DD) in the charger', '52 A', '80 A', 'Statement of compliance handed over', '60 A or less: notify within 28 days'].filter((x) => !evText.includes(x)), []);
eq('EV record: the charger serial from Serials', evText.includes(`Charger serial number ${fe.values.SN_EV[0].s}`), true);
const hp = formFor(['heatpump']);
const fh = fillAll(hp, ['heatpump']);
const hpText = flat(await textOf(await D.rec.makeHpRecord(input(ctxOf(['heatpump'], fh.values, fh.photos)))));
eq('heat pump record: readings, notification, isolator, DNO', ['Heat Pump Electrical Supply Record', 'Insulation resistance, line to earth (500 V)', '>999 MΩ', '240.1 V', 'Self-certified under a competent person scheme', 'Isolator location'].filter((x) => !hpText.includes(x)), []);
eq('heat pump record: the outdoor unit serial from Serials', hpText.includes(`Outdoor unit serial number ${fh.values.SN_HP[0].s}`), true);

/* ── Signing off through the route (an in-memory database) ───────────────────── */
const UNIQUE = { site_signoffs: [['assignment_id', 'stage']], purchase_orders: [['signoff_id']], site_messages: [['dedupe_key']], site_ops: [['assignment_id', 'op_id']], crm_documents: [['storage_path']] };
function fakeDb() {
  const tb = {};
  const rows = (name) => (tb[name] ??= []);
  const files = new Map();
  let poNo = 0;
  const now = () => new Date().toISOString();
  const defaults = (table, r) => {
    const base = { id: r.id ?? randomUUID(), created_at: now(), updated_at: now() };
    if (table === 'purchase_orders') return { ...base, po_number: `PO-${String(++poNo).padStart(4, '0')}`, status: 'draft', changed_since_sent: false, sent_at: null, sent_to: null, paid_on: null, cancelled_at: null, ...r };
    if (table === 'site_signoffs') return { ...base, received_at: now(), po_done_at: null, docs_done_at: null, notified_at: null, flags: [], extra: {}, ...r };
    if (table === 'site_messages') return { ...base, status: 'queued', sent_at: null, provider_id: null, error: null, ...r };
    if (table === 'crm_documents') return { ...base, archived_at: null, visible: false, ...r };
    return { ...base, ...r };
  };
  const clash = (table, r) => (UNIQUE[table] ?? []).some((cols) => cols.every((c) => r[c] != null) && rows(table).some((x) => x !== r && cols.every((c) => x[c] === r[c])));
  const from = (table) => {
    const where = [];
    let mode = 'select';
    let payload = null;
    const order = [];
    let lim = null;
    let returning = false;
    const like = (v, p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`).test(String(v ?? ''));
    const exec = () => {
      if (mode === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => defaults(table, structuredClone(r)));
        for (const r of list) if (clash(table, r)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        rows(table).push(...list);
        return { data: Array.isArray(payload) ? list : list[0], error: null, many: Array.isArray(payload) };
      }
      let list = rows(table).filter((r) => where.every((w) => w(r)));
      if (mode === 'update') {
        for (const r of list) Object.assign(r, structuredClone(payload));
        return { data: list, error: null, many: true };
      }
      if (mode === 'delete') {
        tb[table] = rows(table).filter((r) => !list.includes(r));
        return { data: list, error: null, many: true };
      }
      for (const o of [...order].reverse()) list = [...list].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
      if (lim != null) list = list.slice(0, lim);
      return { data: list.map((r) => structuredClone(r)), error: null, many: true };
    };
    const out = (r, one) => {
      if (r.error) return { data: null, error: r.error };
      if (!one) return { data: mode === 'select' || returning || r.many === false ? r.data : null, error: null };
      const list = Array.isArray(r.data) ? r.data : [r.data];
      if (one === 'single' && list.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      return { data: list[0] ? structuredClone(list[0]) : null, error: null };
    };
    const b = {
      select: () => ((returning = mode !== 'select'), b),
      insert: (r) => ((mode = 'insert'), (payload = r), b),
      upsert: (r) => ((mode = 'insert'), (payload = r), b),
      update: (p) => ((mode = 'update'), (payload = p), b),
      delete: () => ((mode = 'delete'), b),
      eq: (c, v) => (where.push((r) => r[c] === v), b),
      neq: (c, v) => (where.push((r) => r[c] !== v), b),
      in: (c, v) => (where.push((r) => v.includes(r[c])), b),
      is: (c, v) => (where.push((r) => (r[c] ?? null) === v), b),
      lt: (c, v) => (where.push((r) => r[c] < v), b),
      lte: (c, v) => (where.push((r) => r[c] <= v), b),
      gt: (c, v) => (where.push((r) => r[c] > v), b),
      like: (c, p) => (where.push((r) => like(r[c], p)), b),
      or: (s) => {
        const parts = s.split(',').map((x) => x.split('.'));
        where.push((r) => parts.some(([c, op, v]) => op === 'is' && v === 'null' && (r[c] ?? null) === null));
        return b;
      },
      order: (col, o) => (order.push({ col, asc: o?.ascending !== false }), b),
      limit: (n) => ((lim = n), b),
      range: () => b,
      maybeSingle: async () => out(exec(), 'maybe'),
      single: async () => out(exec(), 'single'),
      then: (res, rej) => Promise.resolve(out(exec(), null)).then(res, rej),
    };
    return b;
  };
  const storage = {
    from: (bucket) => ({
      upload: async (path, bytes, o) => {
        const k = `${bucket}/${path}`;
        if (files.has(k) && !o?.upsert) return { error: { message: 'exists' } };
        files.set(k, new Uint8Array(bytes));
        return { error: null };
      },
      download: async (path) => ({ data: files.has(`${bucket}/${path}`) ? new Blob([files.get(`${bucket}/${path}`)]) : null }),
      remove: async (paths) => (paths.forEach((p) => files.delete(`${bucket}/${p}`)), { error: null }),
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://storage.test/${bucket}/${path}` } }),
    }),
    getBucket: async () => ({ data: {} }),
    createBucket: async () => ({}),
  };
  return { t: tb, rows, files, from, storage, rpc: async () => ({ data: null, error: { message: 'no rpc' } }) };
}

globalThis.__after = [];
globalThis.__rec = { email: [], whatsapp: [], notify: [], tasks: [], orders: [], activity: [], stage: [], deadlines: [] };
const db = (globalThis.__db = fakeDb());
process.env.SITE_LINK_SECRET = 'a-test-key-for-site-links-0123456789abcdef';
const route = await import('../src/app/api/site/jobs/[id]/signoff/route.ts');

const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TOKEN = 'phone-token-for-the-electrician-0123456789';
const contact = { id: randomUUID(), subcontractor_id: null, name: 'Sam Sparks', company: 'Sparks Electrical', email: 'sam@example.test', mobile: '07700 900777', wa_id: '447700900777', whatsapp_ok: true, vat_number: null, cis_rate: 'gross', cis_verified_on: '2026-01-10', archived_at: null, scheme: 'NAPIT', scheme_number: '12345', instruments: [] };
db.rows('site_contacts').push(contact);
db.rows('site_devices').push({ id: randomUUID(), contact_id: contact.id, token_hash: createHash('sha256').update(TOKEN).digest('hex'), last_seen_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', revoked_at: null });

function job(products, extra = {}) {
  const p = { id: randomUUID(), enquiry_id: randomUUID(), owner_id: 'owner-1', project_ref: 'HX-0042', address: '12 High Street\nMaindee\nNewport', postcode: 'NP20 4AB', products, stage: 'installing', commissioned_at: null, system: { ...SYSTEM, ...DESIGN, battery_kwh: 8 }, paperwork: { dno_route: 'g98' }, dno_ref: 'G98-12345', ...extra };
  db.rows('crm_projects').push(p);
  db.rows('enquiries').push({ id: p.enquiry_id, name: 'Jane Smith', postcode: 'NP20 4AB' });
  return p;
}
function electrician(p, products, values, photos) {
  const a = {
    id: randomUUID(), project_id: p.id, contact_id: contact.id, trade: 'electrician', trade_label: null, scope: null, forms: F.formsFor(products), cert_route: 'own', starts_on: '2026-11-03', days: 1,
    rate_pence: 45000, rate_basis: 'fixed', rate_qty: null, raise_po: true, vat_treatment: 'none', vat_note: null, cis_override: null, share_customer_phone: false, note_to_trade: null,
    status: 'started', link_hash: null, link_generation: 1, link_created_at: null, sent_at: null, opened_at: null, started_at: null, signed_at: null, done_at: null, cancelled_at: null,
    answers: wrap(values), rev: 3, answers_saved_at: null, flags: [], schema_version: 2, created_by: null,
  };
  db.rows('site_assignments').push(a);
  for (const [slot, n] of Object.entries(photos)) {
    if (slot === 'CERT_FILE') continue;
    for (let i = 0; i < n; i++) db.rows('crm_photos').push({ id: randomUUID(), project_id: p.id, assignment_id: a.id, slot, storage_path: `projects/${p.id}/site/${a.id}/${slot}/${randomUUID()}.jpg`, taken_at: null, created_at: new Date().toISOString() });
  }
  // Their certificate, uploaded as a PDF (filed for the handover pack's CC21).
  db.rows('crm_documents').push({ id: randomUUID(), project_id: p.id, category: 'certificate', name: 'HX-0042 Electrical certificate (EIC.pdf)', mime: 'application/pdf', storage_path: `projects/${p.id}/site/${a.id}/CERT_FILE/${randomUUID()}-EIC.pdf`, visible: false, source: 'site', handover_slot: 'CC21', release: 'with_pack', archived_at: null, created_at: new Date().toISOString() });
  return a;
}
const sign = async (a, body = {}) => {
  const req = new Request(`http://localhost/api/site/jobs/${a.id}/signoff`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ stage: 'main', name: 'Sam Sparks', signature: SIG, declaration: 'I confirm…', signed_at: new Date().toISOString(), rev: 3, ...body }) });
  const res = await route.POST(req, { params: Promise.resolve({ id: a.id }) });
  return { status: res.status, body: await res.json() };
};
const afterReply = async () => {
  for (const fn of globalThis.__after.splice(0)) await fn();
};

// A solar + battery job, signed off on a Friday afternoon.
fixed = Date.parse('2026-11-06T15:30:00Z');
const p1 = job(['solar', 'battery']);
db.rows('site_assignments').push({ id: randomUUID(), project_id: p1.id, contact_id: randomUUID(), trade: 'roofer', status: 'done', answers: wrap(ROOFER), flags: [], forms: [], created_at: '2026-11-03T09:00:00Z' });
const e1 = electrician(p1, ['solar', 'battery'], { ...full.values, EF3: undefined }, full.photos);
delete e1.answers.EF3;
const gate = await sign(e1, { op_id: randomUUID() });
eq('EF3 not ticked: the server’s gate says so (422), nothing signed, no PO', [gate.status, gate.body.error, gate.body.missing.map((m) => m.key), db.rows('site_signoffs').length, db.rows('purchase_orders').length], [422, 'gate', ['EF3'], 0, 0]);
e1.answers.EF3 = { v: true, src: 'typed' };
e1.answers.EF2 = { v: 'not_possible', src: 'typed' };
e1.answers.EF2n = { v: 'No Wi-Fi reaches the garage', src: 'typed' };
const op = randomUUID();
const s1 = await sign(e1, { op_id: op });
await afterReply();
const s2 = await sign(e1, { op_id: op });
const s3 = await sign(e1, { op_id: randomUUID() });
await afterReply();
eq('signed: 200 with the PO number', [s1.status, s1.body.po?.po_number, s1.body.status], [200, 'PO-0001', 'done']);
eq('three sends: one sign-off, one PO, the same reply', [db.rows('site_signoffs').length, db.rows('purchase_orders').length, s2.body.signoff.id === s1.body.signoff.id, s3.body.again], [1, 1, true, true]);
const proj1 = db.rows('crm_projects').find((x) => x.id === p1.id);
eq('commissioned_at from the sign-off (EF1 confirmed)', proj1.commissioned_at, s1.body.signoff.signed_at);
eq('the stage moves on: the commissioned event', globalThis.__rec.stage.filter((x) => x.id === p1.id).map((x) => x.event).slice(0, 1), ['commissioned']);
eq('the deadline tasks are made (MCS, G98/G99, Building Regs)', globalThis.__rec.deadlines.includes(p1.id), true);
const tasks = (key) => globalThis.__rec.tasks.filter((x) => x.key.startsWith(key));
eq('one handover call task, Friday → Monday, for the job owner', tasks('site-call:').map((x) => [x.title, x.dueDate, x.assigneeId]), [['Handover call: go through the pack and the solar app with Jane', '2026-11-09', 'owner-1']]);
eq('EF2 not possible: the monitoring task', tasks('site-monitoring:').map((x) => x.title), ['Set up monitoring remotely · 12 High Street, NP20 4AB']);
const made = db.rows('crm_documents').filter((d) => d.project_id === p1.id && d.generated_key);
eq('the paperwork: F43, F44, F44A, F74, F75 in their handover items, held for the pack', made.map((d) => [d.generated_key, d.handover_slot, d.release, d.visible]).sort(), [
  ['F43', 'F43', 'with_pack', false],
  ['F44', 'F44', 'with_pack', false],
  ['F44A', 'F44A', 'with_pack', false],
  ['F74', 'F74', 'with_pack', false],
  ['F75', 'F75', 'with_pack', false],
  ['PO-0001', null, 'now', false],
]);
eq('…named with the job ref', made.find((d) => d.generated_key === 'F43').name, 'HX-0042 F43 PV Array Test Report.pdf');
eq('…once each, however many sends', made.length, 6);
eq('every step after the reply stamped', ['po_done_at', 'docs_done_at', 'notified_at'].map((k) => !!db.rows('site_signoffs')[0][k]), [true, true, true]);
eq('their instruments remembered for next time', db.rows('site_contacts')[0].instruments.map((x) => x.text), ['Megger MFT1741+ s/n 1234567']);
const storedF75 = flat(await textOf(db.files.get(`crm-docs/${made.find((d) => d.generated_key === 'F75').storage_path}`)));
eq('the stored F75 carries the engineer and the signature line', [storedF75.includes('Sam Sparks'), storedF75.includes('Signed on the Heliaxis app')], [true, true]);
// What the handover pack is told (site/handover-facts.ts): their certificate's reference, and F78's
// verification as the form works it out from F43's (it isn't stored unless they change it).
const HF = await import('../src/lib/site/handover-facts.ts');
const hf = await HF.siteHandoverFacts(db, p1.id, {});
eq('the handover pack is told: their certificate’s reference, F78 "initial" (from F43), nothing waiting', [hf.certRef, hf.values.f78_kind, e1.answers.f78_kind, hf.certWaits, hf.nextInspection], ['NAPIT EIC 00123456', 'initial', undefined, null, null]);

// An EV job signed the day before Christmas: the call skips the bank holidays; the DNO to-do.
fixed = Date.parse('2026-12-24T14:00:00Z');
const p2 = job(['ev'], { system: { ev_charger_model: 'Zappi 2' }, paperwork: {} });
const e2 = electrician(p2, ['ev'], fe.values, fe.photos);
const s4 = await sign(e2, { op_id: randomUUID() });
await afterReply();
eq('EV: signed, its own PO', [s4.status, s4.body.po?.po_number], [200, 'PO-0002']);
eq('the call goes over Christmas and the Boxing Day holiday: Tuesday 29th', tasks('site-call:').filter((x) => x.projectId === p2.id).map((x) => [x.title, x.dueDate]), [['Handover call: go through the pack and the charger app with Jane', '2026-12-29']]);
eq('the DNO to-do: notify within 28 days', tasks('site-dno-ev:').map((x) => [x.title, x.dueDate]), [['Notify the DNO about the EV charger (connect and notify) · 12 High Street, NP20 4AB', '2027-01-14']]);
eq('the EV record, in the miscellaneous handover item; no F43', db.rows('crm_documents').filter((d) => d.project_id === p2.id && d.generated_key && !d.generated_key.startsWith('PO')).map((d) => [d.generated_key, d.handover_slot]), [['EV_REC', 'CCMH']]);
fixed = null;

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
