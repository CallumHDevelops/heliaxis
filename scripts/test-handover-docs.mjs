// The handover pack's own documents (src/lib/documents/handover/*) made from fixture data, and the
// combined pack: every generated document renders with its title, the legal footer on every page and
// nothing "Not answered"; F78 prints only the tables for the job's technologies and never a value
// the job hasn't got; the receipt lists exactly the recorded payments; Build gives one PDF with the
// contents page straight after the cover, a signed PDF and a 30 MB manual left as separate files,
// the page numbers in the contents matching where each document starts.
// Usage: node --experimental-strip-types scripts/test-handover-docs.mjs   (PDF_OUT=/dir keeps the PDFs)
import fs from 'node:fs';
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
const I = await import('../src/lib/handover/inputs.ts');
const S = await import('../src/lib/handover/slots.ts');
const H = await import('../src/lib/handover/settings-shared.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const D = {
  cover: await import('../src/lib/documents/handover/cover-letter.ts'),
  f19i: await import('../src/lib/documents/handover/f19i.ts'),
  f16e: await import('../src/lib/documents/handover/f16e.ts'),
  f47: await import('../src/lib/documents/handover/f47.ts'),
  f76: await import('../src/lib/documents/handover/f76-sheet.ts'),
  f48i: await import('../src/lib/documents/handover/f48i.ts'),
  f49: await import('../src/lib/documents/handover/f49.ts'),
  f49a: await import('../src/lib/documents/handover/f49a.ts'),
  f78: await import('../src/lib/documents/handover/f78.ts'),
  cc4: await import('../src/lib/documents/handover/cc4.ts'),
  cc13: await import('../src/lib/documents/handover/cc13-receipt.ts'),
  pack: await import('../src/lib/documents/handover/pack.ts'),
};
const K = await import('../src/lib/documents/pdf-kit.ts');
const { PDFDocument, PDFName } = await import('pdf-lib');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
async function textOf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
  return pages;
}
const OUT = process.env.PDF_OUT;
const keep = (name, bytes) => OUT && fs.writeFileSync(`${OUT}/${name}.pdf`, bytes);

// A small signature: a drawn squiggle on a transparent PNG.
const sharp = (await import('sharp')).default;
const SIG = new Uint8Array(
  await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90"><path d="M10 60 C 40 10, 70 90, 100 40 S 160 20, 190 60 S 250 70, 290 30" fill="none" stroke="#1a1a1a" stroke-width="4"/></svg>'))
    .png()
    .toBuffer()
);
const load = async () => SIG;

const settings = H.cleanHandoverSettings({
  approved: Object.fromEntries(Object.entries(H.DRAFTS).map(([k, d]) => [k, { version: d.version, at: '2026-10-01T09:00:00Z', by: 'Callum' }])),
  warrantyYears: 10,
  warrantyStart: 'commissioning',
  warrantyText: 'FIXTURE WORDING: what the warranty covers.\n\nFIXTURE WORDING: what it doesn’t cover, and how to claim.',
  nextInspectionYears: 10,
  maintenanceText: 'FIXTURE WORDING: the owner’s maintenance agreement.',
  scheduleRows: [{ item: 'Bird mesh', check: 'Look for gaps from the ground', who: 'You', often: 'Every spring' }],
});
const sig = (via) => ({ name: 'Jane Smith', signed_at: '2026-11-03T17:50:00Z', path: 'signatures/p1/cust.png', via });
const facts = (over = {}) => ({
  today: '2026-11-03',
  job: {
    id: 'p1',
    ref: 'HX-0042',
    title: 'Solar and battery',
    stage: 'installing',
    products: ['solar', 'battery'],
    addressLines: ['12 High Street', 'Maindee', 'Newport', 'NP20 4AB'],
    postcode: 'NP20 4AB',
    installDays: ['2026-11-02', '2026-11-03'],
    commissionedOn: '2026-11-03',
    handedOverOn: null,
    dno: { route: 'g98', status: null, ref: null, submittedAt: null, notified: false },
    deposit: { amount: 500, paidAt: '2026-10-05T10:00:00Z', ref: 'pi_3QX' },
  },
  customer: { name: 'Jane Smith', first: 'Jane', email: 'jane@example.com', phone: '07700 900123' },
  owner: { name: 'Callum Hughes' },
  system: { kwp: 5.28, panel_count: 12, panel_model: 'JA Solar JAM54S30 440', inverter_model: 'GivEnergy Gen 3 5 kW', inverter_kw: 5, battery_model: 'GivEnergy 9.5 kWh', battery_kwh: 9.5, ev_charger_model: null, heat_pump_model: null, heat_pump_kw: null, mpan: '1012345678901', export_limit_kw: null, monitoring: 'GivEnergy' },
  design: designOf({ est_kwh_year: 4620, shade_factor: 0.95, eess_class: 1, battery_kw: 3.6, roof_faces: 'Rear roof', battery_backup: true }),
  paperwork: { mcs_cert_no: 'MCS-00123456', ibg_provider: 'HIES', ibg_ref: 'HIES-998877' },
  electrician: {
    name: 'Dave Price',
    company: 'Price Electrical',
    status: 'done',
    signedAt: '2026-11-03T17:41:00Z',
    signedOn: '2026-11-03',
    signaturePath: 'signatures/p1/site-s1.png',
    values: { f78_kind: 'initial', eess_backup: 'yes', f78_p_circuits: '2 PV strings; 1 AC circuit', f43_iso_loc: ['Built into the inverter'], SN_INV: [{ s: 'SA2231G123', src: 'scan' }], SN_BAT: [{ s: 'BT99887766', src: 'scan' }] },
    customer: { f16e: sig('phone'), g98: { ...sig('phone'), path: 'signatures/p1/cust-g98.png' } },
    partPBy: 'heliaxis',
    certRef: 'HX-0042-EIC',
    nextInspection: null,
  },
  data: {
    F78: { design: { name: 'Callum Hughes', signed_at: '2026-11-03T18:00:00Z', path: 'signatures/p1/f78-design.png', by: 'u1' } },
    CC4: { values: { cu: 'Under the stairs, labelled Solar PV and battery', ac: 'On the loft wall next to the inverter', battery: 'On the side of the battery, in the garage' } },
    F49A: { values: { plan: 'Care Plan', included: 'A yearly visit and a health check of the system', visits: 'One a year', price: '£99 a year', starts: '3 November 2026', cancel: 'Tell us in writing; 30 days’ notice' } },
    F16E: { outstanding: [{ text: 'One cracked ridge tile to replace (scaffold back up)', by: '2026-11-12' }] },
  },
  library: [],
  payments: [{ id: 'x1', kind: 'final', amount_pence: 512345, paid_on: '2026-11-10', method: 'bank_transfer', reference: 'INV-0042' }],
  survey: { shading: ['Chimney', 'Trees'], sunPath: null },
  made: ['F43', 'F44', 'F44A', 'F74', 'F75'],
  settings,
  ...over,
});
const LEGAL = 'Registered in England and Wales No. 16734783';

async function check(name, bytes, must = [], mustNot = []) {
  keep(name, bytes);
  const pages = await textOf(bytes);
  const all = pages.join('\n').replace(/\s+/g, ' ');
  eq(`${name}: the legal footer on every page`, pages.every((p, i) => p.includes(LEGAL) && p.includes(`Page ${i + 1} of ${pages.length}`)), true);
  eq(`${name}: nothing "Not answered", no Easy MCS`, [/Not answered/.test(all), /easy\s*mcs/i.test(all)], [false, false]);
  for (const m of must) eq(`${name}: has "${m}"`, all.includes(m), true);
  for (const m of mustNot) eq(`${name}: hasn’t "${m}"`, all.includes(m), false);
  return { pages, all };
}
const must = (made) => {
  if (!made.ok) throw new Error(`not ready: ${made.why}`);
  return made.input;
};

/* ── Each document from the fixture ────────────────────────────────────────── */

const f = facts();
// The states for the cover letter's contents: the site documents in, the office's to follow.
const views = S.slotStates({
  products: f.job.products,
  dnoRoute: 'g98',
  pas63100: false,
  maintenancePlan: true,
  docs: ['F43', 'F44', 'F44A', 'F74', 'F75', 'CC21', 'F78', 'F19I', 'F16E', 'CC4', 'F49', 'F49A', 'F47'].map((c, i) => ({ id: `d${i}`, slot: c, name: c, source: 'generated', key: c, visible: false, release: 'with_pack', at: '2026-11-03T18:00:00Z', version: 1, mime: 'application/pdf', size: 1, hash: 'h' })),
  marks: {},
  gen: {},
  electrician: 'signed',
  commissioned: '2026-11-03',
  paperwork: f.paperwork,
  dnoSubmitted: false,
  dnoNotified: true,
  due: { mcs: '2026-11-17' },
  invoicePaid: false,
  libraryGaps: [],
  models: [],
  designDoc: false,
  sent: false,
});
const docs = {};
docs.F07BI = await D.cover.makeCoverLetter(must(I.coverInput(f, views)));
await check('F07BI', docs.F07BI, ['Handover Cover Letter', 'Dear Jane,', '12 × JA Solar JAM54S30 440 solar panels (5.28 kWp)', 'MCS-00123456', 'HIES · HIES-998877', 'Smart Export Guarantee', 'Callum Hughes', 'Enclosed']);
docs.F19I = await D.f19i.makeWarranty(must(I.warrantyInput(f)));
await check('F19I', docs.F19I, ['Workmanship Warranty', '10 years from 3 November 2026', 'FIXTURE WORDING', 'HIES, policy HIES-998877', 'Your statutory rights are not affected.']);
docs.F16E = await D.f16e.makeCompletion(must(I.completionInput(f)), load);
await check('F16E', docs.F16E, ['Completion of Works Record', '2 and 3 November 2026', 'One cracked ridge tile to replace', '12 November 2026', 'Signed on the Heliaxis app', 'Dave Price, Price Electrical']);
docs.F47 = await D.f47.makeG98Sheet(must(I.g98Input(f)), load);
await check('F47', docs.F47, ['G98 Form B data sheet', '1012345678901', 'MCS NAP-82308', 'SA2231G123', 'Not recorded', 'It isn’t the form itself']);
docs.F76_SHEET = await D.f76.makeG99Sheet(must(I.g99Input(f)));
await check('F76_SHEET', docs.F76_SHEET, ['G99 data sheet', 'Not for the customer’s pack']);
docs.F48I = await D.f48i.makeShading(must(I.shadingInput(f, { source: 'MIS 3002', issue: 'FIXTURE', verified: true, importantNote: 'FIXTURE NOTE: not MIS 3002’s wording.', shadingNote: 'FIXTURE SHADING NOTE.' })), load);
await check('F48I', docs.F48I, ['Solar PV Shading and Maintenance', '4,620 kWh', 'FIXTURE NOTE', 'Chimney, Trees', 'Never go on the roof']);
docs.F49 = await D.f49.makeSchedule(must(I.scheduleInput(f)));
await check('F49', docs.F49, ['Solar PV Maintenance Schedule', 'As the manufacturer’s manual says', 'Every spring', 'Electrical Installation Certificate']);
docs.F49A = await D.f49a.makeAgreement(must(I.agreementInput(f)));
await check('F49A', docs.F49A, ['Solar PV Maintenance Agreement', '£99 a year', 'FIXTURE WORDING']);
docs.F78 = await D.f78.makeF78(must(I.f78Input(f)), load);
const f78 = await check('F78', docs.F78, ['EESS & PV Handover Document', 'Initial verification', 'This system', 'Class 1', '3.6 kW', '9.5 kWh', 'HX-0042-EIC: Schedule of inspections', 'HX-0042-F44A', 'HX-0042-F43', 'MIS 3002 and MIS 3012', '10 years', '0333 103 8130', 'Signed in the Heliaxis office'], ['Not part of this installation']);
eq('F78: both signatures', ['Construction, inspection and testing', 'Design'].every((x) => f78.all.toUpperCase().includes(x.toUpperCase())), true);
const batteryOnly = facts({ job: { ...f.job, products: ['battery'] }, made: ['F74', 'F75'] });
const f78b = await check('F78-battery-only', await D.f78.makeF78(must(I.f78Input(batteryOnly)), load), ['Not part of this installation']);
eq('F78 battery only: the PV table says not part of it, the EESS table prints', [f78b.all.includes('Usable capacity'), f78b.all.includes('Rated power (kW DC)')], [true, false]);
docs.CC4 = await D.cc4.makeSwitchOff(must(I.switchInput(f)));
await check('CC4', docs.CC4, ['How to switch your system off', 'Under the stairs', 'Built into the inverter', 'back-up power']);
docs.CC13_RECEIPT = await D.cc13.makeReceipt(must(I.receiptInput(f)));
const rc = await check('CC13_RECEIPT', docs.CC13_RECEIPT, ['Payment receipt', '£500.00', '£5,123.45', 'INV-0042', 'pi_3QX']);
eq('receipt: no balance or total worked out', /balance|total|owed/i.test(rc.all.replace('what the installation cost', '')), false);

/* ── The combined pack ─────────────────────────────────────────────────────── */

async function simple(title, pages = 1) {
  const k = await K.newDocument({ code: 'X', title, jobRef: 'HX-0042', issued: '2026-11-03' });
  k.header();
  for (let i = 1; i < pages; i++) {
    k.section(`Part ${i}`);
    k.rows(Array.from({ length: 40 }, (_, j) => ({ label: `Row ${j}`, value: 'Pass' })));
  }
  return k.save();
}
// A digitally signed PDF (an MCS certificate can be): a signature dictionary with its /ByteRange.
const signedDoc = await PDFDocument.create();
signedDoc.addPage(K.A4).drawText('MCS certificate (signed fixture)', { x: 60, y: 760, size: 14 });
signedDoc.context.register(signedDoc.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', ByteRange: [0, 10, 20, 30], Contents: PDFName.of('X') }));
const signed = await signedDoc.save();
// A 30 MB manual.
const bigDoc = await PDFDocument.create();
bigDoc.addPage(K.A4).drawText('Battery manual (30 MB fixture)', { x: 60, y: 760, size: 14 });
bigDoc.context.register(bigDoc.context.stream(new Uint8Array(30 * 1024 * 1024).fill(7), {}));
const big = await bigDoc.save({ useObjectStreams: false });
eq('the manual fixture is over 30 MB', big.length > 30 * 1024 * 1024, true);
const photo = fs.readFileSync(new URL('../public/assets/heliaxis-logo.png', import.meta.url));

const part = (slot, bytes, extra = {}) => {
  const d = S.slotDef(slot);
  return { slot, title: d.title, group: d.group, order: d.order, docId: `doc-${slot}${extra.n ?? ''}`, name: `${slot}.pdf`, mime: 'application/pdf', bytes, ...extra };
};
const parts = [
  part('F78', docs.F78),
  part('CC17', signed),
  part('CC21', await simple('Electrical Installation Certificate', 3)),
  part('F19I', docs.F19I),
  part('F16E', docs.F16E),
  part('CC4', docs.CC4),
  part('F49', docs.F49),
  part('F49A', docs.F49A),
  part('CC10', new Uint8Array(photo), { mime: 'image/png', name: 'schematic.png' }),
  part('F43', await simple('PV Array Test Report', 2)),
  part('F74', await simple('Battery Testing Checklist')),
  part('F75', await simple('Battery Commissioning Checklist')),
  part('F47', docs.F47),
  part('CC5', big, { manual: true, name: 'Battery manual.pdf' }),
  part('CCMH', new Uint8Array([0x50, 0x4b, 3, 4]), { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'SEG guide.docx' }),
];
const follow = ['CC14', 'CC16', 'CC13'].map((c) => ({ slot: c, title: S.slotDef(c).title, group: S.slotDef(c).group, order: S.slotDef(c).order }));
const built = await D.pack.buildPack({
  ref: 'HX-0042',
  issued: '2026-11-03',
  customer: 'Jane Smith',
  address: f.job.addressLines,
  version: 2,
  changes: ['Adds your MCS certificate'],
  system: [
    ['System size', '5.28 kWp'],
    ['Battery', '9.5 kWh usable'],
    ['Inverter', 'GivEnergy Gen 3 5 kW'],
    ['Switched on', '3 November 2026'],
    ['MCS certificate', 'MCS-00123456'],
  ],
  cover: docs.F07BI,
  parts,
  follow,
});
keep('PACK', built.bytes);
const coverPages = (await PDFDocument.load(docs.F07BI)).getPageCount();
const packText = await textOf(built.bytes);
eq('one PDF, the contents straight after the cover', [packText[0].includes('Handover Cover Letter'), packText[coverPages].includes('Your handover pack')], [true, true]);
const sep = Object.fromEntries(built.contents.filter((c) => c.separate).map((c) => [c.slot, c.separate]));
eq('left separate: the signed PDF, the 30 MB manual, the Word file', sep, { CC17: 'signed', CC5: 'size', CCMH: 'not_pdf' });
eq('under 20 MB', built.bytes.length < D.pack.PACK_LIMIT_BYTES, true);
const contentsText = packText.slice(coverPages, coverPages + built.contentsPages).join(' ').replace(/\s+/g, ' ');
eq('contents: separate files and what’s to follow say so', [contentsText.includes('MCS Certificate: separate file in your portal'), contentsText.includes('Paid Invoice: to follow'), contentsText.includes('What’s new in version 2: Adds your MCS certificate')], [true, true, true]);
// Every merged document starts on the page the contents gives it.
const firsts = built.contents.filter((c) => c.first_page);
const titleOn = { F78: 'EESS & PV Handover Document', CC21: 'Electrical Installation Certificate', F19I: 'Workmanship Warranty', F43: 'PV Array Test Report', F47: 'G98 Form B data sheet' };
eq('the page numbers match where each document starts', firsts.filter((c) => titleOn[c.slot]).every((c) => packText[c.first_page - 1].includes(titleOn[c.slot])), true);
eq('the photo became one A4 page', firsts.find((c) => c.slot === 'CC10').pages, 1);
eq('page count adds up', built.pages, coverPages + built.contentsPages + firsts.reduce((n, c) => n + c.pages, 0));
eq('the pack is titled for the job', (await PDFDocument.load(built.bytes)).getTitle(), 'HX-0042 Handover pack');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
