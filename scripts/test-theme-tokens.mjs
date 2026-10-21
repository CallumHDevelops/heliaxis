// Light and dark mode, the stylesheet rules (src/app/theme.css explains them). No browser: reads the files.
//  1. No custom property refers to itself (`--muted: var(--muted)` is a cycle: the value becomes invalid).
//  2. Themed CSS never keys on the phone (`prefers-color-scheme`): that ignores the person's choice.
//     LEFTOVERS lists the files that still do, until their area is converted.
//  3. Nothing declares plain `color-scheme: light` on the page: Chrome still auto-darkens that.
//  4. Converted files (CONVERTED) use the tokens: no colour literals in their rules (a unit's own
//     custom properties may hold some, for a palette tuned on purpose), no re-declared theme tokens,
//     and every var(--x) they use exists.
// When an area is converted, add its files to CONVERTED and take them off LEFTOVERS.
// Usage: node scripts/test-theme-tokens.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Files done: the theme itself, the toggle, the admin shell and Metis. */
const CONVERTED = [
  'src/components/theme/theme-choice.css',
  'src/components/admin/admin-shell.css',
  'src/components/admin/global-search.css',
  'src/app/admin/assistant/assistant.css',
  // The frame round every admin page: the WhatsApp dock's strip, panel and chat list (not the open chat: whatsapp.css).
  'src/components/admin/whatsapp/dock.css',
  'src/components/theme/ThemeChoice.tsx',
  'src/components/theme/ThemeSync.tsx',
  'src/components/theme/BrandLogo.tsx',
  'src/components/admin/AdminShell.tsx',
  'src/components/admin/HeaderUser.tsx',
  'src/components/admin/AppRuntime.tsx',
  'src/components/admin/TopMenu.tsx',
  'src/components/admin/MoreMenu.tsx',
  'src/components/admin/MetisIcon.tsx',
  'src/app/admin/loading.tsx',
  'src/app/admin/assistant/AssistantView.tsx',
  'src/app/admin/app/page.tsx',
  'src/app/admin/app/AppDownload.tsx',
  'src/app/admin/app/SendToPhone.tsx',
];
/** Literals a converted file may keep, and why. */
const ALLOWED_LITERALS = {
  // Full-height embeds (analytics) sit on near-black in both themes.
  'src/components/admin/AdminShell.tsx': ['#111'],
  // Metis's tile is brand artwork: ink with a gold glyph in both themes.
  'src/components/admin/MetisIcon.tsx': ['#ffd35c', '#e3a014', '#211f18'],
};
/** Still keyed on the phone's setting; their areas convert them to html[data-theme]. */
const LEFTOVERS = ['src/app/portal/(onboarding)/portal.css', 'src/components/subcontractors/doc-viewer.css'];
/** Not themed: the public website, the CMS editor (pinned light), the brand page. */
const OUT_OF_SCOPE = [/^src\/app\/\(site\)\//, /^src\/app\/branding\//, /^src\/app\/admin\/cms\.css$/, /^src\/app\/admin\/preview\//, /^src\/components\/(site|home|blog|legal|cms)\//];
/** Custom properties that come from elsewhere on purpose (layout, not colour). */
const EXTERNAL_VARS = new Set(['--hx-tabbar', '--hx-dock', '--font-outfit']);

/** The customers' pages (wf-theme-portal): their portal (/my), their booking link (/book; the website's
    booking form shares booking.css and keeps its own values), the app download page and WhatsApp permission. */
CONVERTED.push(
  'src/app/my/[token]/portal.css',
  'src/app/my/[token]/PortalView.tsx',
  'src/app/my/[token]/HandoverSection.tsx',
  'src/app/my/[token]/page.tsx',
  'src/components/booking/booking.css',
  'src/components/booking/BookingFlow.tsx',
  'src/components/booking/Turnstile.tsx',
  'src/app/book/[token]/page.tsx',
  'src/app/get-app/page.tsx',
  'src/app/admin/crm/whatsapp-permission/WaPermissionView.tsx',
  'src/app/admin/crm/whatsapp-permission/page.tsx'
);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p);
    else if (/\.(css|tsx?)$/.test(name)) files.push(p);
  }
})('src');
const themed = (p) => !OUT_OF_SCOPE.some((re) => re.test(p));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const failures = [];
const fail = (msg) => failures.push(msg);

// Tokens defined by theme.css (both themes).
const themeCss = stripComments(read('src/app/theme.css'));
const TOKENS = new Set([...themeCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
for (const t of ['--bg', '--surface', '--surface-2', '--raised', '--field', '--text', '--text-2', '--muted', '--border', '--border-strong', '--accent', '--accent-ink', '--accent-text', '--ok', '--warn', '--danger', '--info', '--focus']) {
  if (!TOKENS.has(t)) fail(`theme.css: ${t} is missing`);
}
// Tokens from globals.css (shadcn) that theme.css's names must not collide with.
const globals = stripComments(read('src/app/globals.css'));
for (const name of ['--muted', '--accent', '--border']) {
  if (new RegExp(`(^|[\\s;{])${name}\\s*:`).test(globals)) fail(`globals.css re-declares ${name} (use --sc-${name.slice(2)}): it would shadow the theme token`);
}

// 1–3 over every themed stylesheet (and <style> blocks in TSX).
for (const p of files.filter(themed)) {
  const src = stripComments(read(p));
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)/g)) if (m[1] === m[2]) fail(`${p}: ${m[1]}: var(${m[2]}) refers to itself`);
  if (p.endsWith('.css') && /prefers-color-scheme/.test(src) && !LEFTOVERS.includes(p)) fail(`${p}: keys on prefers-color-scheme; use :root[data-theme='dark'] (src/app/theme.css)`);
  if (/(?::root|html)[^{}]*\{[^}]*color-scheme\s*:\s*light\s*[;}]/.test(src)) fail(`${p}: declares plain "color-scheme: light" on the page; Chrome still auto-darkens it (use "only light")`);
}
for (const p of LEFTOVERS) if (!/prefers-color-scheme/.test(stripComments(read(p)))) console.log(`note: ${p} no longer uses prefers-color-scheme — take it off LEFTOVERS`);
// Nested layouts must not set their own color-scheme (it would override the person's choice), nor a
// theme-color other than their area's bar (the site app repeats its ink bar for its prerendered pages).
for (const p of ['src/app/portal/site/layout.tsx', 'src/app/portal/(onboarding)/layout.tsx', 'src/app/admin/layout.tsx']) {
  const src = stripComments(read(p));
  if (/colorScheme/.test(src)) fail(`${p}: sets colorScheme; the root layout does (src/lib/theme)`);
  const tc = /themeColor\s*:\s*([^,\n}]+)/.exec(src);
  if (tc && !(p === 'src/app/portal/site/layout.tsx' && tc[1].trim() === 'INK_BAR[0]')) fail(`${p}: sets themeColor ${tc[1].trim()}; the root layout does (src/lib/theme/routes.ts)`);
}

// 4. Converted files.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /rgba?\(\s*\d/g;
for (const p of CONVERTED) {
  const raw = read(p);
  const src = stripComments(raw);
  const allowed = new Set((ALLOWED_LITERALS[p] ?? []).map((s) => s.toLowerCase()));
  const own = new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const re of [HEX, RGB]) {
    for (const m of src.matchAll(re)) {
      if (allowed.has(m[0].toLowerCase())) continue;
      // In CSS, a unit's own custom property may hold a literal (a palette tuned on purpose, with its dark value).
      const before = src.slice(0, m.index);
      const start = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('\n'));
      const decl = before.slice(start + 1).trim();
      if (/^--[\w-]+\s*:/.test(decl)) continue;
      // An HTML id or a URL fragment, not a colour.
      if (/(href|id|url)\s*[=(:]\s*[`'"]?[^`'"]*$/.test(before.slice(-40))) continue;
      const line = before.split('\n').length;
      fail(`${p}:${line}: colour literal ${m[0]} (use a token from src/app/theme.css)`);
    }
  }
  for (const t of TOKENS) {
    if (p.endsWith('.css') && new RegExp(`(^|[\\s;{])${t}\\s*:`).test(src) && !/^--(as|hx)-/.test(t)) fail(`${p}: re-declares the theme token ${t}`);
  }
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    const v = m[1];
    if (!TOKENS.has(v) && !own.has(v) && !EXTERNAL_VARS.has(v)) fail(`${p}: var(${v}) is not a theme token or declared here`);
  }
}

if (failures.length) {
  console.log(failures.map((f) => `FAIL ${f}`).join('\n'));
  console.log(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${files.filter(themed).length} themed files checked, ${CONVERTED.length} converted files use the tokens (${relative(ROOT, join(ROOT, 'src/app/theme.css'))}: ${TOKENS.size} tokens)`);
