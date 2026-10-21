// The print version of every document the app makes (the owner: "a digital version and a print
// version, print offers an ink saving"): the labour PO with its terms, the supplier's PO, the
// electrician's F43, F44, F44A, F74, F75, EV and heat pump records and photo record, the EIC (final,
// draft, single signature, a long variant) and a Minor Works sheet, each made in both of the kit's
// variants from the same inputs: the same words on the same pages, the digital one on the cream page
// with its dark bands, the print one with no cream, card or band fill; the EIC's IET body on its
// seven pages with the brand's chrome round it; and which documents have a print version.
// Usage: node --experimental-strip-types scripts/test-print-versions.mjs   (PDF_OUT=/dir keeps the PDFs)
import fs from 'node:fs';
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
// Everything outside the document makers that would reach Supabase, Next, Resend or Meta is stood in for.
const STUBS = {
  'server-only': 'export {}',
  'next/server': 'export class NextResponse extends Response {} export function after() {}',
  '@/lib/supabase/admin': 'export const createAdminClient = () => null;',
  '@/lib/crm/server': `export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos'; export const NO_STORE = {};
    export const thumbPath = (p) => p; export const isUuid = () => true; export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }
    export async function logActivity() {} export const json = (b) => new Response(JSON.stringify(b));`,
  '@/lib/notify': 'export async function notify() {}',
  '@/lib/schema-ready': 'export async function schemaReady() { return { site: true, purchaseOrders: true, handover: false }; }',
  '@/lib/surveys/server': 'export async function addSourceTask() { return true; } export async function closeSourceTask() {}',
  '@/lib/crm/move-stage': 'export async function applyStageEvent() { return { moved: true }; }',
  '@/lib/projects/server': 'export async function ensureDeadlineTasks() { return 0; }',
  '@/lib/purchase-orders/server': 'export async function logOrder() {}',
  '@/lib/whatsapp/settings': 'export async function getSettings() { return { quietFromMin: 1260, quietToMin: 525, lateRule: false, lateFromMin: 1230, lateSendAtMin: 420 }; }',
  '@/lib/whatsapp/api': `export const whatsappConfigured = () => true; export const defaultTemplate = () => ({ lang: 'en_GB' }); export async function sendTemplate() { return { ok: true }; }`,
  '@/lib/whatsapp/templates': 'export async function fetchTemplates() { return { ok: true, items: [] }; }',
  '@/lib/subcontractors/server': `export const sha256 = (s) => s; export const newToken = () => 't'; export const portalBaseUrl = (o) => o || 'http://localhost:3000';
    export const clientIp = () => '203.0.113.7'; export const esc = (s) => String(s); export const emailShell = (t, b) => b; export function validSignature() { return true; } export async function sendEmail() { return { ok: true }; }`,
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
const imp = (p) => import(`${SRC}${p}`);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const sharp = (await import('sharp')).default;

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
async function pagesOf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
  const text = [];
  const fills = new Set();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    text.push((await page.getTextContent()).items.map((x) => x.str).join(' '));
    const ops = await page.getOperatorList();
    ops.fnArray.forEach((fn, k) => fn === pdfjs.OPS.setFillRGBColor && fills.add(`#${[...Object.values(ops.argsArray[k])].slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`));
  }
  return { text, fills };
}
const OUT = process.env.PDF_OUT;
const CREAM = ['#f7f2e7', '#fffdf8', '#efe8d8']; // the page, cards, table heading bands
const PAGE = '#f7f2e7';

/** Both variants of one document: the same words on the same pages; cream only on the digital one. */
async function both(name, make, opts = {}) {
  const [d, p] = [await make('digital'), await make('print')];
  if (OUT) {
    fs.writeFileSync(`${OUT}/${name}.pdf`, d);
    fs.writeFileSync(`${OUT}/${name} (print).pdf`, p);
  }
  const [dd, pp] = [await pagesOf(d), await pagesOf(p)];
  eq(`${name}: print says the same on the same pages (${dd.text.length})`, pp.text, dd.text);
  eq(`${name}: the digital one on the cream page, the print one with no cream at all`, [dd.fills.has(PAGE), CREAM.filter((c) => pp.fills.has(c))], [true, []]);
  const all = dd.text.join(' ').replace(/\s+/g, ' ');
  eq(`${name}: nothing a font couldn't draw ("?" between letters)`, /[A-Za-z0-9]\?[A-Za-z0-9]/.test(all.replace(/\?\s/g, ' ')), false);
  if (opts.pages) eq(`${name}: ${opts.pages} pages`, dd.text.length, opts.pages);
  return dd.text;
}

/* ── Which documents have a print version, and the words for the link ────────── */
const PS = await imp('lib/documents/print-shared.ts');
eq(
  'a print version for every document the app makes',
  ['PACK', 'F43', 'F44', 'F44A', 'F74', 'F75', 'EV_REC', 'HP_REC', 'EP_RECORD', 'RF_REPORT', 'SC_REPORT', 'EIC', 'EIC2', 'EIC_DRAFT', 'MEIWC-1', 'MEIWC2-3', 'F78', 'F19I', 'F16E', 'CC4', 'F48I', 'F49', 'F49A', 'F47', 'F76_SHEET', 'CC13_RECEIPT', 'F07BI', 'PO-0042'].filter((k) => !PS.hasPrintVersion(k)),
  []
);
eq('none for uploads, the library or their own certificate', ['CERT_OWN', 'LIB-123', null, '', 'F74B'].filter((k) => PS.hasPrintVersion(k)), []);
eq('the link', [PS.PRINT_LABEL, PS.printHref('/api/crm/documents/x'), PS.printHref('/api/x/pdf?inline=1'), PS.printName('HX-0042 F43 PV Array Test Report.pdf')], [
  'Print version',
  '/api/crm/documents/x?variant=print',
  '/api/x/pdf?inline=1&variant=print',
  'HX-0042 F43 PV Array Test Report (print version).pdf',
]);

/* ── The electrician's documents ──────────────────────────────────────────────── */
const SIG = new Uint8Array(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90"><path d="M10 60 C 40 10, 70 90, 100 40 S 160 20, 290 30" fill="none" stroke="#111" stroke-width="4"/></svg>')).png().toBuffer());
const F = await imp('lib/site/forms/index.ts');
const R = await imp('lib/site/rules.ts');
const { designOf } = await imp('lib/site/design.ts');
const X = await import('./site-electrician-fixtures.mjs');
const { ctxOf, formFor, fillAll, input } = X.makeFixtures({ R, F, designOf });
const products = ['solar', 'battery'];
const full = fillAll(formFor(products), products);
const d = { ...input(ctxOf(products, full.values, full.photos)), date: '2026-11-03', signature: SIG };
const f43 = await imp('lib/documents/site/f43.ts');
const f44 = await imp('lib/documents/site/f44.ts');
const f74 = await imp('lib/documents/site/f74.ts');
const rec = await imp('lib/documents/site/records.ts');
for (const [name, make] of [
  ['F43', f43.makeF43],
  ['F44', f44.makeF44],
  ['F44A', f44.makeF44A],
  ['F74', f74.makeF74],
  ['F75', f74.makeF75],
]) {
  const text = await both(name, (variant) => make({ ...d, variant }));
  eq(`${name}: the title block on every page`, text.every((p, i) => p.includes(`Page ${i + 1} of ${text.length}`) && p.includes('Registered in England and Wales No. 16734783')), true);
}
const ev = fillAll(formFor(['ev']), ['ev']);
await both('EV record', (variant) => rec.makeEvRecord({ ...input(ctxOf(['ev'], ev.values, ev.photos)), signature: SIG, variant }));
const hp = fillAll(formFor(['heatpump']), ['heatpump']);
await both('Heat pump record', (variant) => rec.makeHpRecord({ ...input(ctxOf(['heatpump'], hp.values, hp.photos)), signature: SIG, variant }));
const pr = await imp('lib/documents/site/photo-record.ts');
const PHOTO = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 120, g: 140, b: 160 } } }).jpeg().toBuffer();
const slots = Array.from({ length: 7 }, (_, i) => ({ title: `Slot ${i + 1}`, instruction: 'Cover off, every label readable.', photos: Array.from({ length: 1 + (i % 2) }, (_, j) => ({ bytes: PHOTO, mime: 'image/jpeg', caption: `Slot ${i + 1}`, sub: `Taken 3 Nov 2026 10:2${j}` })) }));
await both('Photo record', (variant) => pr.makePhotoRecord({ ...d, variant }, slots, [{ what: 'Inverter serial', serials: ['110B6002SP0042'], unread: 0 }], [{ title: 'Sign-off', text: 'I confirm that the electrical work is complete.', name: 'Sam Sparks', at: '2026-11-03T17:41:00Z', signature: SIG }]));

/* ── The labour PO, with the owner's terms, and the supplier's PO ─────────────── */
const money = await imp('lib/site/money.ts');
const { labourPoPdf } = await imp('lib/site/labour-po.ts');
const { poTerms } = await imp('lib/site/po-shared.ts');
const lines = [{ description: 'Electrician: commissioning', qty: 1, unit_pence: 45000, cis: true }];
const m = money.labourMoney(lines, 'standard', 20);
const snap = {
  po_number: 'PO-0101', issued: '2026-11-03', version: 1, job: { ref: 'HX-0042', address: '12 High Street, Maindee, Newport, NP20 4AB' },
  sub: { company: 'Sparks Electrical Ltd', contact: 'Sam Sparks', mobile: '07700 900777', email: 'sam@sparks.example.co.uk', firm_ref: 'HLX-SC-2026-009' },
  trade: 'electrician', trade_title: 'Electrician', scope: 'Commission the PV and battery', rate_pence: 45000, basis: 'fixed', qty: 1, qty_words: 'Fixed price', rate_words: money.rateWords(45000, 'fixed'),
  lines: lines.map((l, i) => ({ ...l, net: m.lines[i] })), labour_net: m.labourNet, materials_net: m.materialsNet, net: m.net, vat_treatment: 'standard', vat_words: money.VAT_WORDS.standard, vat: m.vat,
  cis: { words: money.cisWords({ verifiedOn: '2026-09-01', rate: 'net', override: null }), percent: 20, pence: m.cis }, payable: m.payable, payment_terms: null,
  signed: { by: 'Sam Sparks', at: '2026-11-03T17:41:00Z', stage: 'main' }, quote_line: 'Please quote PO-0101 on your invoice and send it to accounts@heliaxis.co.uk', held: [], replaces: null,
  terms: poTerms('12 High Street, Maindee, Newport, NP20 4AB', 'PO-0101'),
};
const po = await both('Labour PO', (variant) => labourPoPdf(snap, { variant }));
const poAll = po.join(' ').replace(/\s+/g, ' ');
eq('Labour PO: what they’ll be paid, and all six terms numbered', [poAll.includes('What you’ll be paid'), [1, 2, 3, 4, 5, 6].every((n) => poAll.includes(`${n}.`)), poAll.includes('CIS is deducted from the labour element only')], [true, true, true]);
const { purchaseOrderPdf } = await imp('lib/purchase-orders/pdf.ts');
const order = {
  id: 'o1', po_number: 'PO-0007', project_id: 'p1', supplier_id: 's1', status: 'sent', deliver_to: 'site', deliver_address: '12 High Street\nMaindee\nNewport', deliver_postcode: 'NP20 4AB',
  required_by: '2026-11-02', notes: 'Please call 30 minutes before arrival.', internal_note: null, net_pence: 0, vat_pence: 0, gross_pence: 0, sent_at: '2026-10-27T09:00:00Z', sent_to: 'orders@example.co.uk',
  sent_by: null, changed_since_sent: false, confirmed_at: null, delivered_at: null, cancelled_at: null, supplier_invoice_ref: null, supplier_invoice_pence: null, paid_on: null, created_by: null, created_at: '2026-10-27T09:00:00Z', updated_at: '2026-10-27T09:00:00Z',
};
const poLines = Array.from({ length: 40 }, (_, i) => ({ position: i, description: `Line ${i + 1}: roof hooks (portrait, slate)`, part_number: i % 3 ? `PART-${i}` : null, qty: 2, unit_cost_pence: i === 4 ? null : 1250, vat_rate: 20, received_qty: null }));
const supplier = { name: 'Midsummer Wholesale', contact_name: 'Dave Jones', email: 'orders@midsummer.example.co.uk', phone: '01234 567890', account_number: 'HELI001', address: 'Unit 4, Trade Park\nCambridge\nCB1 2AB' };
const sup = await both('Supplier PO', (variant) => purchaseOrderPdf({ order, lines: poLines, supplier, jobRef: 'HX-0042', issued: '2026-10-27', orderedBy: 'Callum', contactEmail: 'hello@heliaxis.co.uk', variant }));
eq('Supplier PO: runs onto more pages, the title block on each', [sup.length > 1, sup.every((p, i) => p.includes(`PO-0007 · Page ${i + 1} of ${sup.length}`))], [true, true]);

/* ── The EIC and a Minor Works sheet: the IET form's body, the brand's chrome ──── */
const E = await imp('lib/site/forms/electrician/eic.ts');
const FIX = await imp('lib/site/fixed/iet-eic.ts');
const M = await imp('lib/site/forms/electrician/eic-model.ts');
const { eicPdf } = await imp('lib/documents/eic/eic.ts');
const { meiwcPdf } = await imp('lib/documents/eic/meiwc.ts');
const EF = await import('./site-eic-fixture.mjs');
const ctx = R.makeCtx({
  trade: 'electrician', answers: EF.full(FIX.INSPECTIONS, E.INSPECTION_KEY), design: designOf({}),
  system: { kwp: 5.28, panel_count: 12, panel_model: null, inverter_model: 'GivEnergy Gen 3 5 kW', battery_model: 'GivEnergy 9.5 kWh' },
  products: ['solar', 'battery'], sides: [], photos: { eic_sig_con: 1, eic_sig_ins: 1 }, reads: [], address: '12 High Street, Maindee, Newport, NP20 4AB', signed: [], eic: EF.FACTS,
});
const PNG = EF.scribble();
const sg = { png: PNG, at: '2026-11-03T16:20:00Z' };
const design = { name: 'Sarah Jones', company: 'Heliaxis Ltd', address: '9 Turner Street, Newport, Gwent', postcode: 'NP19 7AZ', tel: '01633 965205', next_n: 10, next_unit: 'years', departures: null, signed_at: '2026-11-04T09:10:00Z', path: 'x.png', by: null, png: PNG };
const base = { route: 'eic', ref: 'HX-0042-EIC', jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: ctx.values, address: ctx.address, sig: { con: sg, ins: sg }, design, draft: false };
const eic = await both('EIC (final)', (variant) => eicPdf({ ...base, variant }), { pages: 7 });
eq('EIC: the form’s sections on its first two pages, its schedules on 4 and 5, the notes and guidance after', [eic[0].includes('SECTION A: DETAILS OF THE CLIENT') && eic[0].includes('SECTION D: NEXT INSPECTION'), eic[1].includes('SECTION E') && eic[1].includes('SECTION J: SCHEDULES'), eic[3].includes('GENERIC SCHEDULE OF CIRCUIT DETAILS'), eic[4].includes('GENERIC SCHEDULE OF TEST RESULTS'), eic[5].includes('Notes for the person producing the Certificate')], [true, true, true, true, true]);
eq('EIC: the title block on every page (the company line, "Certificate No. … · Page x of y", the form it’s on)', eic.every((p, i) => p.includes(`Certificate No. HX-0042-EIC · Page ${i + 1} of 7`) && p.includes('Heliaxis Ltd · 9 Turner Street') && p.includes('Registered in England and Wales No. 16734783') && p.includes('IET model form, BS 7671:2018+A4:2026')), true);
eq('EIC: "Certificate No.:" at the top of every page', eic.every((p) => /Certificate(\/Report)? No\.:\s+HX-0042-EIC/.test(p)), true);
await both('EIC (draft)', (variant) => eicPdf({ ...base, design: null, draft: true, variant }), { pages: 7 });
await both('EIC (single signature)', (variant) => eicPdf({ ...base, route: 'eic_single', values: { ...ctx.values, eic_route: 'eic_single', eic_next: 5, eic_next_unit: 'years' }, sig: { one: sg }, design: null, variant }), { pages: 7 });
const vv = {
  ...ctx.values, eic_earthing: 'tt', eic_means: 'electrode', eic_rod_type: 'Rod', eic_rod_loc: 'Front garden, by the meter box', eic_ra: 21, eic_ra_kind: 'Ze', eic_md: 14, eic_md_unit: 'kVA',
  eic_dep: 'yes', eic_dep_what: 'The battery is in the garage, 0.9 m from the gas meter rather than the 1 m in the manufacturer’s instructions; agreed with the customer as no other place was suitable.',
  eic_exc: 'yes', eic_exc_what: 'The existing garage socket circuit has no 30 mA RCD protection; it is labelled for specific equipment and backed by a risk assessment.',
};
const long = await both('EIC (a long one)', (variant) => eicPdf({ ...base, values: vv, attachments: [{ slot: 'eic_exc_ra', bytes: PNG }], variant }));
eq('EIC (a long one): its continuation sheets after page 2, the schedules still landscape', [long.slice(2).some((p) => p.includes('CONTINUATION SHEET No. 1')), long.some((p) => p.includes('GENERIC SCHEDULE OF TEST RESULTS'))], [true, true]);
const c = M.boardsOf(ctx.values).circuits[0];
await both('Minor Works sheet', (variant) => meiwcPdf({ ref: 'HX-0042-MW1', jobRef: 'HX-0042', issued: '2026-11-03', edition: 'A4:2026', values: ctx.values, address: ctx.address, circuit: c, name: 'DB1 circuit 7', sig: sg, draft: true, variant }));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
