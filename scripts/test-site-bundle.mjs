// The busiest admin pages (CRM home, the Projects board, a subcontractor's page) don't load the trades'
// forms and the EIC into the browser. New project's trades block only needs suggestedTrades
// (src/lib/site/trades.ts) and the people boxes only mobileProblem (src/lib/site/phone.ts); taking either
// from forms/index or assign.ts used to put every form's questions and the IET EIC (~130–150 KB of
// script) on those pages. Walks each page's import graph the way the bundler does (type-only imports
// dropped), from every 'use client' file the page reaches, and checks none of the form code is in it.
// /admin/crm/[id] really does show the Site tab's forms, so it isn't checked.
// Usage: node scripts/test-site-bundle.mjs
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

function resolveFile(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null; // a package
  for (const p of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(p) && statSync(p).isFile()) return p;
  return null;
}

/** The modules a file imports at run time: `import type`, `export type` and all-type braces are dropped, as TypeScript does. */
function importsOf(file) {
  const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    if (m[5]) {
      out.push(m[5]);
      continue;
    }
    if (m[2]) continue;
    const what = m[3].trim();
    const braces = /^\{([\s\S]*)\}$/.exec(what);
    if (braces && braces[1].split(',').map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith('type '))) continue;
    out.push(m[4]);
  }
  return out;
}

const isClient = (file) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(readFileSync(file, 'utf8'));

function walk(starts) {
  const seen = new Set();
  const stack = [...starts];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !/\.(tsx?|mjs|js)$/.test(f)) continue;
    seen.add(f);
    for (const spec of importsOf(f)) {
      const r = resolveFile(f, spec);
      if (r) stack.push(r);
    }
  }
  return seen;
}

/** What the browser loads for a page: everything reachable from the client files the page (and the admin layout) reaches. */
function clientGraph(page) {
  const all = walk([join(SRC, page), join(SRC, 'app/admin/layout.tsx')]);
  return walk([...all].filter(isClient));
}

const FORM_CODE = [/src\/lib\/site\/forms\//, /src\/lib\/site\/fixed\//, /src\/lib\/site\/eic\//, /src\/lib\/site\/rules\.ts$/];
const formCode = (graph) => [...graph].map((f) => relative(ROOT, f)).filter((f) => FORM_CODE.some((re) => re.test(f))).sort();

for (const [name, page] of [
  ['CRM home', 'app/admin/crm/page.tsx'],
  ['the Projects board', 'app/admin/projects/page.tsx'],
  ['a subcontractor’s page', 'app/admin/subcontractors/[id]/page.tsx'],
]) {
  const g = clientGraph(page);
  eq(`${name}: no trade form or EIC code in the browser`, formCode(g), []);
  if (page.includes('projects')) eq(`${name}: the trades block is still there (New project)`, [...g].some((f) => f.endsWith('NewProjectTrades.tsx')) && [...g].some((f) => f.endsWith('src/lib/site/trades.ts')), true);
  if (page.includes('subcontractors')) eq(`${name}: the site contacts card is still there`, [...g].some((f) => f.endsWith('SiteContactsCard.tsx')) && [...g].some((f) => f.endsWith('src/lib/site/phone.ts')), true);
}

// The check would see it: the job's own page loads the forms (its Site tab).
eq('the walk finds form code where it is meant to be (the job page’s Site tab)', formCode(clientGraph('app/admin/crm/[id]/page.tsx')).length > 0, true);

// Still exported where the server and the tests import them.
const forms = readFileSync(join(SRC, 'lib/site/forms/index.ts'), 'utf8');
const assign = readFileSync(join(SRC, 'lib/site/assign.ts'), 'utf8');
eq('forms/index re-exports suggestedTrades', /export \{ suggestedTrades \} from '\.\.\/trades'/.test(forms), true);
eq('assign re-exports the phone checks', /export \{ isEmail, mobileProblem, waIdOf \} from '\.\/phone'/.test(assign), true);
eq('trades.ts and phone.ts import nothing but types', [importsOf(join(SRC, 'lib/site/trades.ts')), importsOf(join(SRC, 'lib/site/phone.ts'))], [[], []]);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
