// The handover pack's own documents (src/lib/documents/handover/*) made from fixture data, and the
// combined pack: every generated document renders with its title and Heliaxis code, the legal footer
// on every page and nothing "Not answered"; the system summary (HX-HO-02) prints only what the job's
// technologies have, its records by Heliaxis code, the standards that apply and never a value the job
// hasn't got; the receipt lists exactly the recorded payments; Build gives one PDF with the
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
  warranty: await import('../src/lib/documents/handover/warranty.ts'),
  completion: await import('../src/lib/documents/handover/completion.ts'),
  g98: await import('../src/lib/documents/handover/g98-sheet.ts'),
  g99: await import('../src/lib/documents/handover/g99-sheet.ts'),
  estimate: await import('../src/lib/documents/handover/estimate.ts'),
  schedule: await import('../src/lib/documents/handover/schedule.ts'),
  plan: await import('../src/lib/documents/handover/plan.ts'),
  summary: await import('../src/lib/documents/handover/summary.ts'),
  switchOff: await import('../src/lib/documents/handover/switch-off.ts'),
  receipt: await import('../src/lib/documents/handover/receipt.ts'),
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
    values: { hos_kind: 'initial', eess_backup: 'yes', hos_circuits: '2 PV strings; 1 AC circuit', pvt_iso_where: ['Built into the inverter'], SN_INV: [{ s: 'SA2231G123', src: 'scan' }], SN_BAT: [{ s: 'BT99887766', src: 'scan' }] },
    customer: { completion: sig('phone'), g98: { ...sig('phone'), path: 'signatures/p1/cust-g98.png' } },
    partPBy: 'heliaxis',
    certRef: 'HX-0042-EIC',
    nextInspection: null,
  },
  data: {
    'HX-HO-02': { design: { name: 'Callum Hughes', signed_at: '2026-11-03T18:00:00Z', path: 'signatures/p1/summary-design.png', by: 'u1' } },
    'HX-HO-09': { values: { cu: 'Under the stairs, labelled Solar PV and battery', ac: 'On the loft wall next to the inverter', battery: 'On the side of the battery, in the garage' } },
    'HX-HO-12': { values: { plan: 'Care Plan', included: 'A yearly visit and a health check of the system', visits: 'One a year', price: '£99 a year', starts: '3 November 2026', cancel: 'Tell us in writing; 30 days’ notice' } },
    'HX-HO-08': { outstanding: [{ text: 'One cracked ridge tile to replace (scaffold back up)', by: '2026-11-12' }] },
  },
  library: [],
  payments: [{ id: 'x1', kind: 'final', amount_pence: 512345, paid_on: '2026-11-10', method: 'bank_transfer', reference: 'INV-0042' }],
  survey: { shading: ['Chimney', 'Trees'], sunPath: null },
  made: ['HX-PV-02', 'HX-PV-01', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02'],
  settings,
  ...over,
});
const LEGAL = 'Registered in England and Wales No. 16734783';

async function check(name, bytes, must = [], mustNot = []) {
  keep(name, bytes);
  const pages = await textOf(bytes);
  const all = pages.join('\n').replace(/\s+/g, ' ');
  eq(`${name}: the legal footer on every page`, pages.every((p, i) => p.includes(LEGAL) && p.includes(`Page ${i + 1} of ${pages.length}`)), true);
  eq(`${name}: nothing "Not answered", no other company’s name or form code`, [/Not answered/.test(all), /easy\s*mcs/i.test(all), /\b(F\d\d[A-Z]*|CC\d+|CCMH)\b/.test(all)], [false, false, false]);
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
  docs: ['HX-PV-02', 'HX-PV-01', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-HO-04', 'HX-HO-02', 'HX-HO-06', 'HX-HO-08', 'HX-HO-09', 'HX-HO-11', 'HX-HO-12', 'HX-HO-15'].map((c, i) => ({ id: `d${i}`, slot: c, name: c, source: 'generated', key: c, visible: false, release: 'with_pack', at: '2026-11-03T18:00:00Z', version: 1, mime: 'application/pdf', size: 1, hash: 'h' })),
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
docs['HX-HO-01'] = await D.cover.makeCoverLetter(must(I.coverInput(f, views)));
await check('HX-HO-01', docs['HX-HO-01'], ['Covering letter', 'HX-HO-01 · PROJECT HX-0042', 'Dear Jane,', '12 × JA Solar JAM54S30 440 solar panels (5.28 kWp)', 'MCS-00123456', 'HIES · HIES-998877', 'Smart Export Guarantee', 'Callum Hughes', 'Enclosed']);
docs['HX-HO-06'] = await D.warranty.makeWarranty(must(I.warrantyInput(f)));
await check('HX-HO-06', docs['HX-HO-06'], ['Heliaxis workmanship warranty', 'HX-HO-06 · Issue 1', '10 years from 3 November 2026', 'FIXTURE WORDING', 'HIES, policy HIES-998877', 'Your statutory rights are not affected.']);
docs['HX-HO-08'] = await D.completion.makeCompletion(must(I.completionInput(f)), load);
await check('HX-HO-08', docs['HX-HO-08'], ['Completion sign-off', 'HX-HO-08 · Issue 1', '2 and 3 November 2026', 'One cracked ridge tile to replace', '12 November 2026', 'Signed on the Heliaxis app', 'Dave Price, Price Electrical']);
docs['HX-HO-15-SHEET'] = await D.g98.makeG98Sheet(must(I.g98Input(f)), load);
await check('HX-HO-15-SHEET', docs['HX-HO-15-SHEET'], ['G98 data sheet', 'HX-HO-15 · PROJECT HX-0042', '1012345678901', 'MCS NAP-82308', 'SA2231G123', 'Not recorded', 'It isn’t the form itself']);
docs['HX-HO-16-SHEET'] = await D.g99.makeG99Sheet(must(I.g99Input(f)));
await check('HX-HO-16-SHEET', docs['HX-HO-16-SHEET'], ['G99 data sheet', 'HX-HO-16 · PROJECT HX-0042', 'Not for the customer’s pack']);
docs['HX-HO-10'] = await D.estimate.makeShading(must(I.shadingInput(f, { source: 'MIS 3002', issue: 'FIXTURE', verified: true, importantNote: 'FIXTURE NOTE: not MIS 3002’s wording.', shadingNote: 'FIXTURE SHADING NOTE.' })), load);
await check('HX-HO-10', docs['HX-HO-10'], ['Solar estimate, shading and care', 'HX-HO-10 · Issue 1', '4,620 kWh', 'FIXTURE NOTE', 'Chimney, Trees', 'Never go on the roof']);
docs['HX-HO-11'] = await D.schedule.makeSchedule(must(I.scheduleInput(f)));
await check('HX-HO-11', docs['HX-HO-11'], ['Maintenance schedule', 'HX-HO-11 · Issue 1', 'As the maker’s manual says (see Product manuals and warranties)', 'Every spring', 'Electrical Installation Certificate', 'The makers’ manuals and warranties are in Product manuals and warranties, in this pack.']);
docs['HX-HO-12'] = await D.plan.makeAgreement(must(I.agreementInput(f)));
await check('HX-HO-12', docs['HX-HO-12'], ['Your maintenance plan', 'HX-HO-12 · Issue 1', '£99 a year', 'FIXTURE WORDING']);
docs['HX-HO-02'] = await D.summary.makeSummary(must(I.summaryInput(f)), load);
const sum = await check(
  'HX-HO-02',
  docs['HX-HO-02'],
  [
    'System summary and sign-off',
    'HX-HO-02 · Issue 1',
    'TESTED AND SWITCHED ON',
    'New installation',
    'This system',
    'Class 1',
    '3.6 kW',
    '9.5 kWh',
    'Records behind this summary',
    'Solar PV inspection record HX-PV-01 HX-0042',
    'Solar PV string test results HX-PV-02 HX-0042',
    'Battery function tests',
    'HX-HO-04 HX-0042-EIC',
    'MCS MIS 3002 (solar PV) and MCS MIS 3012 (battery storage)',
    'Within 10 years',
    '0333 103 8130',
    'Signed in the Heliaxis office',
  ],
  ['No solar panels in this installation.', 'No battery in this installation.']
);
eq('system summary: both sign-offs', ['Designed by', 'Installed, inspected and tested by'].every((x) => sum.all.toUpperCase().includes(x.toUpperCase())), true);
eq('system summary: in the pack ticked, the certificate to follow', [sum.all.includes('✓'), sum.all.includes('To follow')], [true, true]);
const batteryOnly = facts({ job: { ...f.job, products: ['battery'] }, made: ['HX-BAT-01', 'HX-BAT-02'] });
const sumB = await check('HX-HO-02-battery-only', await D.summary.makeSummary(must(I.summaryInput(batteryOnly)), load), ['No solar panels in this installation.', 'MCS MIS 3012 (battery storage)'], ['MCS MIS 3002']);
eq('system summary battery only: the solar part says there is none, the battery part prints', [sumB.all.includes('Usable storage'), sumB.all.includes('Panel power (kWp, DC)')], [true, false]);
// A full name and a longer Ltd name under the electrician's signature: wrapped in its column, every
// text run inside the page's margins (it once ran off the right edge), in both variants.
{
  const longFirm = facts({ electrician: { ...f.electrician, name: 'Christopher Williams', company: 'Llewellyn Electrical Contractors and Renewables Ltd' } });
  for (const variant of ['digital', 'print']) {
    const bytes = await D.summary.makeSummary({ ...must(I.summaryInput(longFirm)), variant }, load);
    const lf = await check(`HX-HO-02-long-firm-${variant}`, bytes, ['Christopher Williams, Llewellyn Electrical Contractors and', 'Renewables Ltd', 'Signed on the Heliaxis app, 3 Nov 2026 17:41']);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true }).promise;
    const outside = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const pw = page.view[2];
      for (const it of (await page.getTextContent()).items) {
        if (!it.str.trim() || it.transform[1] !== 0) continue;
        const x = it.transform[4];
        if (x < K.MARGIN.l - 0.05 || x + it.width > pw - K.MARGIN.r + 0.05) outside.push(`p${i} ${it.str}`);
      }
    }
    eq(`HX-HO-02 with a long firm (${variant}): every text run inside the margins`, outside, []);
    eq(`HX-HO-02 with a long firm (${variant}): still two pages, the note after the signatures`, [lf.pages.length, /Renewables Ltd Signed on the Heliaxis app, 3 Nov 2026 17:41 Each signature covers/.test(lf.all)], [2, true]);
  }
}
docs['HX-HO-09'] = await D.switchOff.makeSwitchOff(must(I.switchInput(f)));
await check('HX-HO-09', docs['HX-HO-09'], ['How to switch your system off', 'HX-HO-09 · Issue 1', 'Under the stairs', 'Built into the inverter', 'back-up power']);
docs['HX-HO-18-RECEIPT'] = await D.receipt.makeReceipt(must(I.receiptInput(f)));
const rc = await check('HX-HO-18-RECEIPT', docs['HX-HO-18-RECEIPT'], ['Payment receipt', 'HX-HO-18 · Issue 1', '£500.00', '£5,123.45', 'INV-0042', 'pi_3QX']);
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
  part('HX-HO-02', docs['HX-HO-02']),
  part('HX-HO-03', signed),
  part('HX-HO-04', await simple('Electrical Installation Certificate', 3)),
  part('HX-HO-06', docs['HX-HO-06']),
  part('HX-HO-08', docs['HX-HO-08']),
  part('HX-HO-09', docs['HX-HO-09']),
  part('HX-HO-11', docs['HX-HO-11']),
  part('HX-HO-12', docs['HX-HO-12']),
  part('HX-HO-13', new Uint8Array(photo), { mime: 'image/png', name: 'schematic.png' }),
  part('HX-PV-02', await simple('Solar PV string test results', 2)),
  part('HX-BAT-01', await simple('Battery inspection record')),
  part('HX-BAT-02', await simple('Battery switch-on and test record')),
  part('HX-HO-15', await simple('G98 notice (as sent, fixture)')),
  part('HX-HO-17', big, { manual: true, name: 'Battery manual.pdf' }),
  part('HX-HO-19', new Uint8Array([0x50, 0x4b, 3, 4]), { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'SEG guide.docx' }),
];
const follow = ['HX-HO-05', 'HX-HO-07', 'HX-HO-18'].map((c) => ({ slot: c, title: S.slotDef(c).title, group: S.slotDef(c).group, order: S.slotDef(c).order }));
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
  cover: docs['HX-HO-01'],
  parts,
  follow,
});
keep('PACK', built.bytes);
const coverPages = (await PDFDocument.load(docs['HX-HO-01'])).getPageCount();
const packText = await textOf(built.bytes);
eq('one PDF, the contents straight after the cover', [packText[0].includes('Covering letter'), packText[coverPages].includes('Your handover pack')], [true, true]);
const sep = Object.fromEntries(built.contents.filter((c) => c.separate).map((c) => [c.slot, c.separate]));
eq('left separate: the signed PDF, the 30 MB manual, the Word file', sep, { 'HX-HO-03': 'signed', 'HX-HO-17': 'size', 'HX-HO-19': 'not_pdf' });
eq('under 20 MB', built.bytes.length < D.pack.PACK_LIMIT_BYTES, true);
const contentsText = packText.slice(coverPages, coverPages + built.contentsPages).join(' ').replace(/\s+/g, ' ');
eq('contents: separate files and what’s to follow say so', [contentsText.includes('MCS certificate: separate file in your portal'), contentsText.includes('Invoice and receipt: to follow'), contentsText.includes('What’s new in version 2: Adds your MCS certificate')], [true, true, true]);
// Every merged document starts on the page the contents gives it.
const firsts = built.contents.filter((c) => c.first_page);
const titleOn = { 'HX-HO-02': 'System summary and sign-off', 'HX-HO-04': 'Electrical Installation Certificate', 'HX-HO-06': 'Heliaxis workmanship warranty', 'HX-PV-02': 'Solar PV string test results', 'HX-HO-15': 'G98 notice (as sent, fixture)' };
eq('the page numbers match where each document starts', firsts.filter((c) => titleOn[c.slot]).every((c) => packText[c.first_page - 1].includes(titleOn[c.slot])), true);
eq('the photo became one A4 page', firsts.find((c) => c.slot === 'HX-HO-13').pages, 1);
eq('page count adds up', built.pages, coverPages + built.contentsPages + firsts.reduce((n, c) => n + c.pages, 0));
eq('the pack is titled for the job', (await PDFDocument.load(built.bytes)).getTitle(), 'HX-0042 Handover pack');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
