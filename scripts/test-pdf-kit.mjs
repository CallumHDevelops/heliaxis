// The PDF document kit (src/lib/documents/pdf-kit.ts) and the generated-document store
// (src/lib/documents/store.ts): symbols print as themselves (Ω, ², ≥, °, no "?"), the footer is on
// every page, no Easy MCS anywhere, a missing must stops a finished document, the print variant
// says the same on the same pages with no cream fills, a ruled form's slim title block, and saveGenerated's
// versions (same inputs: nothing new; changed: v2 with v1 archived; visible: out of date).
// Usage: node --experimental-strip-types scripts/test-pdf-kit.mjs
import { registerHooks } from 'node:module';

const SRC = new URL('../src/', import.meta.url).href;
// The CRM server module (Supabase, Next) is stood in for: the store only needs its bucket name and two calls.
const CRM_STUB = `data:text/javascript,${encodeURIComponent("export const DOCS_BUCKET = 'crm-docs'; export async function ensureDocsBucket() {} export async function fingerprintDocument() { return null; }")}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    if (specifier === '@/lib/crm/server') return { url: CRM_STUB, shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(spec) && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, context);
      throw e;
    }
  },
});
const K = await import('../src/lib/documents/pdf-kit.ts');
const S = await import('../src/lib/documents/store.ts');
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

/* ── A document with the symbols, long enough to run onto more pages ───────── */
async function fixture(variant) {
  const kit = await K.newDocument({ code: 'HX-PV-02', title: 'Solar PV string test results', revision: 'Issue 1', jobRef: 'HX-0042', issued: '2026-11-03', variant });
  kit.header({ meta: [['Reference', 'HX-0042'], ['Date', '3 November 2026']] });
  kit.idGrid([
    ['Installation address', '12 High Street, Maindee, Newport, NP20 4AB'],
    ['Customer', 'Jane Smith'],
  ]);
  kit.section('String tests', { intro: 'Insulation resistance ≥ 1 MΩ at 500 V; cable 6 mm²; ambient 12 °C; RCD IΔn 30 mA.' });
  kit.rows([
    { label: 'Insulation resistance (+ to earth)', value: '>999 MΩ', must: true },
    { label: 'Cable size', value: '6 mm²' },
    { label: 'Module temperature', value: '24 °C ± 2' },
    { label: 'Comments', value: null },
  ]);
  kit.checklist([
    { label: 'DC isolator fitted and labelled', mark: 'tick' },
    { label: 'Array frame bonded', mark: 'na' },
    { label: 'Cable entry weatherproof', mark: 'cross', note: 'Note 1: re-sealed on the day' },
  ]);
  kit.grid({ columns: ['String', 'Voc (V)', 'Isc (A)', 'Polarity'], rows: Array.from({ length: 70 }, (_, i) => [String(i + 1), '396.8', '13.9', 'Pass']) });
  kit.note('NOTE 1: readings taken with the array in full sun; Voc within ±5% of expected.');
  kit.rows([{ label: 'What you’ll be paid', value: '£450.00', strong: true }]);
  kit.list(['1. The first term, long enough to run onto a second line of the page so the words sit beside their number and not under it.', '2. The second.']);
  return kit.save();
}
const bytes = await fixture();
// PDF_OUT=/some/dir keeps the fixture to look at.
if (process.env.PDF_OUT) (await import('node:fs')).writeFileSync(`${process.env.PDF_OUT}/kit-fixture.pdf`, bytes);
const pages = await textOf(bytes);
const all = pages.join('\n');
eq('runs onto more than one page', pages.length > 1, true);
for (const sym of ['Ω', '²', '≥', '°', '±']) eq(`"${sym}" prints as itself`, all.includes(sym), true);
eq('no "?" stands in for a symbol', /\?/.test(all), false);
eq('the footer is on every page', pages.every((p, i) => p.includes(`HX-PV-02 · Issue 1 · Page ${i + 1} of ${pages.length}`) && p.includes('Registered in England and Wales No. 16734783')), true);
const flat = all.replace(/\s+/g, ' ');
eq('the legal line has the MCS number and the address (it wraps)', ['MCS NAP-82308', 'VAT GB507431316', '9 Turner Street', 'NP19 7AZ'].every((x) => flat.includes(x)), true);
eq('no Easy MCS anywhere', /easy\s*mcs/i.test(all), false);
eq('the eyebrow and title', all.includes('HX-PV-02 · PROJECT HX-0042') && all.includes('Solar PV string test results'), true);
eq('table headings repeat on the next page', pages.slice(1).some((p) => p.includes('VOC (V)')), true);
eq('an empty should prints "Not answered"', all.includes('Not answered'), true);
eq('small: the fonts are cut down to what documents use', bytes.length < 250_000, true);
const { PDFDocument } = await import('pdf-lib');
const meta = await PDFDocument.load(bytes);
eq('metadata: title and author', [meta.getTitle(), meta.getAuthor()], ['HX-PV-02 Solar PV string test results – HX-0042', 'Heliaxis Limited']);
eq('Δ in IΔn as its look-alike (the brand face hasn’t a Greek capital delta), never "?"', /I ?[∆Δ] ?n 30 mA/.test(flat) && !/I ?\? ?n/.test(flat), true);
eq('numbered terms: the number apart, the words beside it', flat.includes('1. The first term') && flat.includes('2. The second.'), true);

/* ── The print variant (the ink saver): the same document, nothing filled in cream ─ */
const printed = await fixture('print');
eq('print: the same words on the same pages as digital', await textOf(printed), pages);
/** The fill colours a document's pages set, as "#rrggbb" (pdf.js gives each as its three bytes). */
async function fills(b) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(b), useSystemFonts: false, disableFontFace: true }).promise;
  const out = new Set();
  for (let i = 1; i <= doc.numPages; i++) {
    const ops = await (await doc.getPage(i)).getOperatorList();
    ops.fnArray.forEach((fn, k) => fn === pdfjs.OPS.setFillRGBColor && out.add(`#${[...Object.values(ops.argsArray[k])].slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`));
  }
  return out;
}
const CREAMS = ['#f7f2e7', '#fffdf8', '#efe8d8']; // paper, card, the table heading band
const [dFills, pFills] = await Promise.all([fills(bytes), fills(printed)]);
eq('digital (the default): the cream page, cards and table headings', CREAMS.every((c) => dFills.has(c)), true);
eq('print: no cream, card or heading fill anywhere', CREAMS.filter((c) => pFills.has(c)), []);
eq('digital is the default; ?variant= anything but print is digital', [K.lookOf().variant, K.variantOf('print'), K.variantOf('x'), K.variantOf(null)], ['digital', 'print', 'digital', 'digital']);
eq('flagged words (TBC, the draft and revised notices): deep amber on digital, ink on print', [K.lookOf().flag, K.lookOf('print').flag], [K.AMBER_TEXT, K.INK]);

/* ── A ruled form (the EIC): its own page head, the slim title block, the form's words ─ */
async function form(variant) {
  const f = await K.newDocument({
    code: 'EIC',
    title: 'Electrical Installation Certificate',
    jobRef: 'HX-0042',
    issued: '2026-11-03',
    variant,
    margins: { l: 28, r: 28, t: 16 },
    pageHead: (d) => {
      d.text('ELECTRICAL INSTALLATION CERTIFICATE', d.x, d.top - 11, 11.6, { bold: true });
      d.logo(d.x + d.width - 72, d.top - 6, 72);
      return 30;
    },
    footer: { lines: ['Heliaxis Ltd · 9 Turner Street, Newport, Gwent, NP19 7AZ'], ref: 'Certificate No. HX-0042-EIC', label: '', sub: 'IET model form, BS 7671:2018+A4:2026\n(15 April 2026)' },
  });
  let n = 0;
  while (f.pageNumber < 2 && n < 200) f.block(12, (d) => d.text(`Row ${++n}`, d.x, d.top - 9, 8));
  return f.save();
}
const formPages = await textOf(await form());
eq('a form: its page head and "Certificate No. … · Page x of y" in the title block on every page', formPages.every((p, i) => p.includes('ELECTRICAL INSTALLATION CERTIFICATE') && p.includes(`Certificate No. HX-0042-EIC · Page ${i + 1} of ${formPages.length}`) && p.includes('IET model form, BS 7671:2018+A4:2026')), true);
eq('a form: no "Document" label, the form keeps its own words', formPages.some((p) => p.includes('DOCUMENT')), false);
eq('a form in print: the same words', await textOf(await form('print')), formPages);

/* ── A finished document can't have a must unanswered; a draft says so in red ─ */
const strict = await K.newDocument({ code: 'RF_REPORT', label: 'Roofer report', title: 'Roofer report', jobRef: 'HX-0042', issued: '2026-11-03' });
let threw = null;
try {
  strict.rows([{ label: 'Panel model', value: '', must: true }]);
} catch (e) {
  threw = e instanceof K.MissingAnswer ? e.label : String(e);
}
eq('a missing must stops a finished document', threw, 'Panel model');
const draft = await K.newDocument({ code: 'RF_REPORT', label: 'Roofer report', title: 'Roofer report', jobRef: 'HX-0042', issued: '2026-11-03', draft: true });
draft.header();
draft.rows([{ label: 'Panel model', value: '', must: true }]);
const dtext = (await textOf(await draft.save())).join(' ');
eq('a draft carries the banner and "Not answered"', dtext.includes('Draft: not signed yet') && dtext.includes('Not answered'), true);
eq('a report labels its footer by name', dtext.includes('Roofer report · Page 1 of 1'), true);
eq('file names start with the job ref, then the title (no code)', [K.docFileName('HX-0042', '', 'Solar PV string test results', 2), K.docFileName('HX-0042', '', 'Roofer report')], ['HX-0042 Solar PV string test results v2.pdf', 'HX-0042 Roofer report.pdf']);
eq('signed stamp in UK time', K.stampWords('2026-11-03T17:41:00Z'), '3 Nov 2026 17:41');

/* ── saveGenerated, against an in-memory stand-in for the database ─────────── */
function fakeDb() {
  const rows = [];
  const files = new Map();
  let n = 0;
  const q = (table) => {
    const where = [];
    let order = null;
    let lim = null;
    let mode = 'select';
    let patch = null;
    let inserted = null;
    let clash = null;
    const run = () => {
      if (clash) return { data: null, error: clash };
      if (mode === 'insert') return { data: inserted, error: null };
      let list = rows.filter((r) => where.every((w) => w(r)));
      if (mode === 'update') {
        list.forEach((r) => Object.assign(r, patch));
        return { data: list, error: null };
      }
      if (order) list = [...list].sort((a, b) => (order.asc ? a[order.col] - b[order.col] : b[order.col] - a[order.col]));
      if (lim) list = list.slice(0, lim);
      return { data: list, error: null };
    };
    const b = {
      select: () => b,
      eq: (c, v) => (where.push((r) => r[c] === v), b),
      is: (c, v) => (where.push((r) => (r[c] ?? null) === v), b),
      lt: (c, v) => (where.push((r) => r[c] < v), b),
      order: (col, o) => ((order = { col, asc: o?.ascending !== false }), b),
      limit: (k) => ((lim = k), b),
      insert: (r) => {
        mode = 'insert';
        // crm_documents.storage_path is unique (crm-v2.sql).
        if (rows.some((x) => x.storage_path === r.storage_path)) {
          clash = { code: '23505', message: 'duplicate key value violates unique constraint "crm_documents_storage_path_key"' };
          return b;
        }
        inserted = { id: `d${++n}`, archived_at: null, ...r };
        rows.push(inserted);
        return b;
      },
      update: (p) => ((mode = 'update'), (patch = p), b),
      single: async () => run(),
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    void table;
    return b;
  };
  return { rows, files, from: q, storage: { from: () => ({ upload: async (p, bytes) => (files.set(p, bytes), { error: null }) }) } };
}
const db = fakeDb();
const pdf = new Uint8Array([37, 80, 68, 70]);
const r1 = await S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { a: 1, b: [2, 3] } });
eq('first save: v1', [r1.status, r1.doc.version, r1.doc.name, r1.doc.storage_path], ['saved', 1, 'HX-0042 Roofer report.pdf', 'projects/p1/generated/RF_REPORT-v1.pdf']);
const r2 = await S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { b: [2, 3], a: 1 } });
eq('same inputs (any key order): no new row', [r2.status, db.rows.length], ['same', 1]);
const r3 = await S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { a: 2 } });
eq('changed inputs: v2, v1 archived', [r3.status, r3.doc.version, r3.doc.name, !!db.rows[0].archived_at, db.rows.length], ['saved', 2, 'HX-0042 Roofer report v2.pdf', true, 2]);
db.rows[1].visible = true;
const r4 = await S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { a: 3 } });
eq('changed inputs on a visible document: out of date, nothing new', [r4.status, db.rows.length, r4.doc.version], ['out_of_date', 2, 2]);
eq('isOutOfDate agrees', S.isOutOfDate(r4.doc, { a: 3 }), true);
const r5 = await S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { a: 3 }, force: true });
eq('Regenerate (force) replaces it, the old one archived and hidden', [r5.status, r5.doc.version, db.rows[1].visible, !!db.rows[1].archived_at], ['saved', 3, false, true]);
// Two saves at once (the cron and the Handover tab) both read v3 as current and pick v4: the file path
// is unique, so one is refused (the next refresh makes it), and there's never a second current version.
const both = await Promise.allSettled([
  S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { a: 4 } }),
  S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { a: 5 } }),
]);
const live = () => db.rows.filter((r) => r.generated_key === 'RF_REPORT' && !r.archived_at).map((r) => r.version);
eq('two saves at once: one saved, one refused, one current version', [both.map((x) => x.status).sort(), live()], [['fulfilled', 'rejected'], [4]]);
// One that slipped through earlier (v4 and v5 both current): the next save archives every older version.
db.rows.push({ id: 'd-stray', project_id: 'p1', generated_key: 'RF_REPORT', version: 5, inputs_hash: 'x', visible: true, archived_at: null, storage_path: 'projects/p1/generated/RF_REPORT-v5.pdf' });
const r8 = await S.saveGenerated(db, 'p1', { key: 'RF_REPORT', name: 'HX-0042 Roofer report.pdf', bytes: pdf, inputs: { a: 6 }, force: true });
eq('…and the next save leaves only itself current, the others hidden', [r8.doc.version, live(), db.rows.filter((r) => r.generated_key === 'RF_REPORT' && r.visible).length], [6, [6], 0]);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
