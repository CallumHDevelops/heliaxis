// Originality: no string Heliaxis ships shares a run of six or more words with the source forms the
// site records replaced. scripts/site-originality.json holds only hashes of the source's 6-word runs
// (sha256 of the run, first 12 hex characters), never its text. Every string literal, template piece
// and JSX text in src/ is normalised the way the fixture was made (lower case, curly quotes
// straightened, apostrophes inside words dropped, hyphens, dashes and slashes split words, mm² → mm2,
// × → x, 9.4 → 9p4), split into sentences (. ? ! ; : · →), with the standards' own titles, unavoidable
// technical terms and the facts kept on purpose treated as breaks, and each 6-word run is hashed and
// looked up. The strings put together at run time are checked as well: the declaration and record
// statements an electrician signs, every field of the electrician's pack, the generated records and the
// system summary as rendered, and the coverage fixture (scripts/site-forms-coverage.json).
// Usage: node --experimental-strip-types scripts/test-site-originality.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('../src/', import.meta.url).href;
const mod = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = { 'server-only': 'export {}', '@/lib/crm/server': "export const DOCS_BUCKET = 'crm-docs'; export const CRM_BUCKET = 'crm-photos';" };
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

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── The normalisation (as the fixture was made) ──────────────────────────────── */
const FIX = JSON.parse(readFileSync(new URL('scripts/site-originality.json', ROOT), 'utf8'));
const N = FIX.n;
const HASHES = new Set(FIX.hashes);
const BREAK = ' ‖ ';
// Cited, not copied: standards and their own titles; unavoidable technical terms; facts kept on purpose.
const ALLOW = [
  'bs en iec 62446 1', 'bs en 62305', 'bs en 61427 1', 'bs 7671', 'iec 60364 6', 'iec 60364 7 712', 'pas 63100 2024', 'pas 63100', 'mis 3002', 'mis 3012', 'mcs 012', 'ena g98', 'ena g99', 'ena g100',
  'engineering recommendation g100', 'iet code of practice for electrical energy storage systems', 'iet code of practice for grid connected solar photovoltaic systems',
  'protection against fire of battery energy storage systems for use in dwellings',
  'extraneous conductive parts?', 'exposed conductive parts?', 'main protective bonding', 'main earthing terminal', 'circuit protective conductor', 'protective earthing conductor', 'supplementary bonding',
  'automatic disconnection of supply', 'voc \\(?stc\\)?', 'isc \\(?stc\\)?', 'class ii', 'selv', 'pelv', 'loss of mains', 'island mode', 'neutral earth', 'surge protection devices?', 'switch disconnector',
  'double or reinforced insulation',
  'telephone 0333 103 8130', '0333 103 8130', 'hello mcscertified com', 'hello heliaxis co uk', '01633 965205', '9 turner street newport (?:gwent )?np19 7az', 'heliaxis l(?:imi)?t(?:e)?d',
].map((a) => new RegExp(`(?<![a-z0-9‖])${a}(?![a-z0-9‖])`, 'g'));

function norm(s) {
  s = s.toLowerCase();
  s = s.replace(/’/g, "'").replace(/‘/g, "'").replace(/“/g, '"').replace(/”/g, '"');
  s = s.replace(/mm²/g, 'mm2').replace(/m²/g, 'm2').replace(/Ω/g, ' ohm ').replace(/×/g, ' x ');
  s = s.replace(/[™®©]/g, ' ');
  s = s.replace(/([\p{L}\p{N}_])'([\p{L}\p{N}_])/gu, '$1$2');
  s = s.replace(/[–—\-/]/g, ' ');
  s = s.replace(/(\d)\.(\d)/g, '$1p$2');
  return s;
}
const words = (s) => s.match(/[a-z0-9‖]+/g) ?? [];
const hash = (run) => createHash('sha256').update(run).digest('hex').slice(0, 12);

/** The runs of N words a string shares with the source (in our words: the run, never the source's). */
function shared(text, set = HASHES) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?;:])\s+|\s·\s|→/)) {
    // The allowed terms are matched on the words alone, so punctuation between them doesn't matter.
    let n = words(norm(sentence)).join(' ');
    for (const rx of ALLOW) n = n.replace(rx, BREAK);
    const tok = words(n);
    for (let i = 0; i + N <= tok.length; i++) {
      const run = tok.slice(i, i + N);
      if (run.includes('‖')) continue;
      if (set.has(hash(run.join(' ')))) out.push(run.join(' '));
    }
  }
  return out;
}

/* ── The machinery itself ─────────────────────────────────────────────────────── */
eq('the fixture is hashes only: 12 hex characters each, as many as it says', [FIX.hashes.every((h) => /^[0-9a-f]{12}$/.test(h)), FIX.hashes.length === FIX.count, N], [true, true, 6]);
const toy = new Set([hash('the quick brown fox jumps over')]);
eq('a shared run of six words is found, whatever the case, quotes and hyphens', [shared('The quick-brown fox jumps over the dog.', toy).length, shared('the quick brown fox jumps', toy).length, shared('The quick brown fox · jumps over', toy).length], [1, 0, 0]);
eq('an allowed term breaks a run', shared('main protective bonding the quick brown fox jumps over', new Set([hash('bonding the quick brown fox jumps')])).length, 0);

/* ── Every string in src/ ─────────────────────────────────────────────────────── */
function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const srcDir = new URL('src', ROOT).pathname;
// The IET's model EIC (BS 7671:2018+A4:2026), copied word for word under the IET's licence: its
// declarations are BS 7671's own wording, which the source forms quote too. Nothing else is excused.
const IET = ['lib/site/fixed/iet-eic.ts'];
const hits = [];
let strings = 0;
for (const file of files(srcDir)) {
  if (IET.includes(file.slice(srcDir.length + 1))) continue;
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    let s = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) s = node.text;
    else if (ts.isJsxText(node)) s = node.text;
    if (s && /[a-z].*\s.*[a-z]/i.test(s)) {
      strings++;
      for (const run of shared(s)) hits.push(`${file.slice(srcDir.length + 1)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} “${run}”`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
eq(`no string in src/ shares a ${N}-word run with the source forms (${strings} strings checked)`, hits, []);

/* ── Strings put together at run time ─────────────────────────────────────────── */
const F = await import('../src/lib/site/forms/index.ts');
const R = await import('../src/lib/site/rules.ts');
const DECL = await import('../src/lib/site/declaration.ts');
const { designOf } = await import('../src/lib/site/design.ts');
const X = await import('./site-electrician-fixtures.mjs');
const { ctxOf, formFor, fillAll, input } = X.makeFixtures({ R, F, designOf });
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const runtime = [];
const sb = formFor(['solar', 'battery']);
const full = fillAll(sb, ['solar', 'battery']);
const c = ctxOf(['solar', 'battery'], full.values, full.photos);
// Every field of the pack: its label, help, ⓘ, options and notes for this job; the flags' words.
for (const step of sb.steps) {
  runtime.push(['step', step.title], ['step', step.intro ?? '']);
  for (const f of step.fields) {
    runtime.push([f.key, f.label], [f.key, f.hint ?? ''], [f.key, f.info ?? ''], [f.key, f.group ?? ''], [f.key, f.groupNote ?? ''], ...(f.options ?? []).map((o) => [f.key, o.label]));
    try {
      if (f.note) runtime.push([f.key, f.note(c) ?? '']);
    } catch {
      /* a note that needs a string index */
    }
  }
}
for (const fl of R.flagsFor(sb, ctxOf(['solar', 'battery'], { ...full.values, pvt_polarity: ['fail', 'pass'], pvi_entry: 'problem', pvi_entryn: 'x', bat_temp: 'fail' }, full.photos))) runtime.push([fl.code, fl.text]);
// What the electrician signs, and each record's statement.
const decl = sb.sig.declaration(c);
runtime.push(['declaration', decl]);
for (const code of ['HX-PV-01', 'HX-PV-02', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-HO-02']) runtime.push([code, DECL.signedStatement(decl, code) ?? '']);
// The records as rendered.
const textOf = async (bytes) => X.flat(await X.textOf(pdfjs, bytes));
const docs = [
  ['HX-PV-01', (await import('../src/lib/documents/site/pv-inspect.ts')).makePvInspect],
  ['HX-PV-02', (await import('../src/lib/documents/site/pv-tests.ts')).makePvTests],
  ['HX-PV-03', (await import('../src/lib/documents/site/pv-switch-on.ts')).makePvSwitchOn],
  ['HX-BAT-01', (await import('../src/lib/documents/site/battery.ts')).makeBatteryInspection],
  ['HX-BAT-02', (await import('../src/lib/documents/site/battery.ts')).makeBatteryTests],
];
for (const [code, make] of docs) runtime.push([code, await textOf(await make({ ...input(c), declaration: decl }))]);
const I = await import('../src/lib/handover/inputs.ts');
const H = await import('../src/lib/handover/settings-shared.ts');
const { summaryFacts } = await import('./site-summary-fixture.mjs');
const sum = I.summaryInput(summaryFacts({ H, designOf }));
eq('the system summary renders from the fixture', sum.ok, true);
if (sum.ok) runtime.push(['HX-HO-02', await textOf(await (await import('../src/lib/documents/handover/summary.ts')).makeSummary(sum.input, async () => X.PNG))]);
// The coverage fixture describes each source item in our words.
for (const r of JSON.parse(readFileSync(new URL('scripts/site-forms-coverage.json', ROOT), 'utf8')).rows) runtime.push([r.id, r.what]);
const late = runtime.flatMap(([where, s]) => shared(s).map((run) => `${where} “${run}”`));
eq(`nothing assembled at run time shares a ${N}-word run either (${runtime.length} strings and records)`, late, []);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
