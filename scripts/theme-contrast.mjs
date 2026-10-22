// Light and dark mode in a real browser: renders pages in each theme and reports anything below WCAG AA,
// and checks Chrome never auto-darkens them. Needs a running app (next start / next dev) and Playwright.
//
//   node scripts/theme-contrast.mjs --base http://localhost:3000 --cookie "sb-…-auth-token=…" \
//     [--paths /admin,/admin/assistant | --screens screens.json] [--modes light,dark,match-dark,forcedark,forcedark-light]
//     [--widths 390,1440] [--out dir] [--shots] [--strict]
//
// Modes (each a fresh browser):
//   light            hx-theme=light, phone light            expect data-theme=light, meta "only light"
//   dark             hx-theme=dark, phone light             expect data-theme=dark, meta "dark"
//   match-dark       no choice, phone dark                  expect data-theme=dark, meta "light dark"
//   forcedark        no choice, phone dark, Chrome's auto-dark on   expect our dark, untouched by Chrome
//   forcedark-light  hx-theme=light, phone dark, auto-dark on       expect our light, untouched by Chrome
// Checks on every page: text contrast (axe-core's color-contrast plus a computed-style walk that
// composites translucent backgrounds; 4.5:1, or 3:1 for large text), the edges of inputs and
// checkboxes (3:1 against what's round them, WCAG 1.4.11), the theme attributes and metas, and in the
// auto-dark modes a painted probe in the page's own --bg colour (Chrome repaints it if it darkens the page).
// In dark modes, light patches (a light background outside an .hx-light island, an image or a canvas)
// are listed as leftovers; --strict makes them failures. Script errors (React hydration warnings
// included) are listed; --errors-fail makes them failures. Exit 1 on any failure.
//
// screens.json: [{ "id": "more-menu", "path": "/admin/assistant", "widths": [390], "click": [".hx-tabs details > summary"] }]
// Playwright: the app doesn't depend on it; set PLAYWRIGHT_MODULE, or it's looked for in node_modules and
// /opt/node-tools/node_modules (browsers: PLAYWRIGHT_BROWSERS_PATH, e.g. /opt/pw-browsers).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const many = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));
const flag = (name) => args.includes(`--${name}`);

const BASE = opt('base', process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.resolve(opt('out', 'theme-contrast-out'));
const WIDTHS = opt('widths', '390,1440').split(',').map(Number);
const MODES = opt('modes', 'light,dark,match-dark,forcedark,forcedark-light').split(',');
const SHOTS = flag('shots');
const STRICT = flag('strict');
const ERRORS_FAIL = flag('errors-fail');
const COOKIES = [...many('cookie'), ...(process.env.THEME_AUDIT_COOKIE ? [process.env.THEME_AUDIT_COOKIE] : [])];
const screens = opt('screens')
  ? JSON.parse(fs.readFileSync(opt('screens'), 'utf8'))
  : opt('paths', '/admin,/admin/assistant')
      .split(',')
      .map((p) => ({ id: p.replace(/^\//, '').replace(/[^\w-]+/g, '_') || 'root', path: p }));

const FORCE_DARK = 'WebContentsForceDark:inversion_method/cielab_based/image_behavior/selective/foreground_lightness_threshold/150/background_lightness_threshold/150';
const MODE = {
  light: { scheme: 'light', pref: 'light', expect: 'light', meta: 'only light' },
  dark: { scheme: 'light', pref: 'dark', expect: 'dark', meta: 'dark' },
  'match-dark': { scheme: 'dark', pref: null, expect: 'dark', meta: 'light dark' },
  forcedark: { scheme: 'dark', pref: null, expect: 'dark', meta: 'light dark', force: true },
  'forcedark-light': { scheme: 'dark', pref: 'light', expect: 'light', meta: 'only light', force: true },
};
for (const m of MODES) if (!MODE[m]) throw new Error(`Unknown mode ${m} (${Object.keys(MODE).join(', ')})`);

async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const t of tries) {
    try {
      return await import(t.startsWith('/') ? pathToFileURL(t).href : t);
    } catch {
      /* next */
    }
  }
  throw new Error('Playwright not found: set PLAYWRIGHT_MODULE to its index.mjs');
}
const { chromium } = await loadPlaywright();
const AXE = path.resolve('node_modules/axe-core/axe.min.js');
const hasAxe = fs.existsSync(AXE);

/* ── In the page ───────────────────────────────────────────────────────────── */
function inPage(expectDark) {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const ratio = (x, y) => {
    const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
    return (a + 0.05) / (b + 0.05);
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const root = getComputedStyle(document.documentElement);
  const canvas = parse(getComputedStyle(document.body).backgroundColor);
  const pageBase = canvas && canvas.a > 0 ? canvas : parse(root.backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  /** The background an element sits on: its own and its ancestors' colours, composited. */
  function bgOf(el) {
    const layers = [];
    let image = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) image = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let base = { ...pageBase, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { bg: base, image };
  }
  const sel = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 3; e = e.parentElement) {
      const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      parts.unshift(`${e.tagName.toLowerCase()}${cls}`);
      if (cls) break;
    }
    return parts.join(' > ');
  };
  const visible = (el) => {
    // Not inside a closed <details>, display:none, visibility:hidden or opacity 0 anywhere up the tree.
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const effectiveOpacity = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };

  const text = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  let checked = 0;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!visible(el) || el.closest('svg, [aria-hidden="true"], script, style, noscript, nextjs-portal')) continue;
    if (el.closest(':disabled, [aria-disabled="true"]')) continue; // exempt (WCAG 1.4.3)
    const cs = getComputedStyle(el);
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const { bg, image } = bgOf(el);
    const op = effectiveOpacity(el);
    const fg = over({ ...fg0, a: fg0.a * op }, bg);
    const r = ratio(fg, bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
    const need = large ? 3 : 4.5;
    checked++;
    if (r < need) text.push({ el: sel(el), text: t.slice(0, 60), ratio: Math.round(r * 100) / 100, need, fg: hex(fg), bg: hex(bg), image });
  }

  // Edges of inputs and checkboxes: 3:1 against what's round them, unless the fill itself stands out.
  // A borderless field inside a drawn box (a chat composer) is judged by the box's edge. Custom radios and
  // checkboxes with their own words (a segmented control) are told apart by the words, so they're skipped.
  function edgeOf(el) {
    const cs = getComputedStyle(el);
    const around = el.parentElement ? bgOf(el.parentElement).bg : pageBase;
    const fill = parse(cs.backgroundColor);
    const own = fill && fill.a > 0 ? over(fill, around) : around;
    if (ratio(own, around) >= 3) return { ok: true };
    const widths = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs[`border${s}Width`]));
    if (!widths.some((w) => w > 0)) return { none: true };
    const edge = parse(cs.borderBottomColor);
    const r = edge ? ratio(over(edge, own), around) : 0;
    return { ok: r >= 3, ratio: r, around, edge: edge ? over(edge, own) : null, underline: widths[2] > 0 && widths[0] === 0 };
  }
  const ui = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea, [role=checkbox], [role=radio], [role=switch]')) {
    if (!visible(el) || el.closest(':disabled, [aria-disabled="true"]')) continue;
    // Off the page and hidden from everyone (a form's anti-bot field): nobody sees or reaches its edge.
    if (el.closest('[aria-hidden="true"]') && el.getBoundingClientRect().right <= 0) continue;
    if (/^(checkbox|radio|switch)$/.test(el.getAttribute('role') || '') && el.textContent.trim()) continue;
    // A native checkbox or radio (appearance auto) is painted by the browser in the page's color-scheme with its
    // own edge (Chrome: #767676 on light, #858585 on dark, over 4:1 on every surface here); its CSS border and
    // background aren't what's on screen, so measuring them (or the box round it) would be wrong.
    if (el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type) && getComputedStyle(el).appearance !== 'none') continue;
    if (getComputedStyle(el).boxShadow !== 'none') continue;
    let e = edgeOf(el);
    for (let up = el.parentElement, i = 0; e.none && up && i < 2; up = up.parentElement, i++) e = edgeOf(up);
    if (!e.ok) ui.push({ el: sel(el), what: e.underline ? 'underline' : 'edge', ratio: Math.round((e.ratio ?? 0) * 100) / 100, around: e.around ? hex(e.around) : '?', edge: e.edge ? hex(e.edge) : null });
  }

  // Leftovers on dark: light patches that aren't paper islands, media, or the theme's own fills (gold, the
  // light "inverse" button, status colours).
  const light = [];
  if (expectDark) {
    const probe = document.createElement('i');
    document.body.appendChild(probe);
    const fills = new Set(
      ['--accent', '--accent-hover', '--inverse', '--ok', '--warn', '--danger', '--info', '--wa', '--claude', '--ph-y', '--ph-done', '--text'].map((t) => {
        probe.style.backgroundColor = `var(${t})`;
        const c = parse(getComputedStyle(probe).backgroundColor);
        return c ? hex(c) : '';
      })
    );
    probe.remove();
    for (const el of document.querySelectorAll('body *')) {
      if (light.length >= 40) break;
      if (el.closest('.hx-light, img, video, canvas, iframe, svg, picture, nextjs-portal')) continue;
      const c = parse(getComputedStyle(el).backgroundColor);
      if (!c || c.a < 0.6 || lum(c) <= 0.5 || fills.has(hex(c)) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 400) continue;
      light.push({ el: sel(el), bg: hex(c), size: `${Math.round(r.width)}×${Math.round(r.height)}` });
    }
  }

  const metas = (name) => [...document.querySelectorAll(`meta[name="${name}"]`)].map((m) => (m.media ? `${m.content} ${m.media}` : m.content));
  const logos = [...document.querySelectorAll('.hx-logo > img')].filter(visible).map((i) => i.getAttribute('src'));
  return {
    checked,
    text,
    ui,
    light,
    theme: document.documentElement.getAttribute('data-theme'),
    pref: document.documentElement.getAttribute('data-theme-pref'),
    scope: document.documentElement.getAttribute('data-theme-scope'),
    rootScheme: root.colorScheme,
    colorScheme: metas('color-scheme'),
    themeColor: metas('theme-color'),
    logos,
    bg: root.getPropertyValue('--bg').trim(),
  };
}

/* ── Run ───────────────────────────────────────────────────────────────────── */
fs.mkdirSync(OUT, { recursive: true });
const host = new URL(BASE).hostname;
const results = [];
let failures = 0;
for (const mode of MODES) {
  const M = MODE[mode];
  const browser = await chromium.launch({ channel: 'chromium', args: M.force ? [`--enable-features=${FORCE_DARK}`] : [] });
  for (const width of WIDTHS) {
    const mobile = width < 761;
    const ctx = await browser.newContext({
      viewport: { width, height: mobile ? 844 : 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: M.scheme,
      locale: 'en-GB',
      timezoneId: 'Europe/London',
    });
    const jar = COOKIES.map((c) => {
      const i = c.indexOf('=');
      return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: '/' };
    });
    if (M.pref) jar.push({ name: 'hx-theme', value: M.pref, domain: host, path: '/' });
    if (jar.length) await ctx.addCookies(jar);
    for (const s of screens) {
      if (s.widths && !s.widths.includes(width)) continue;
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
      page.on('console', (m) => m.type() === 'error' && /hydrat|did not match|#418|#423|#425/i.test(m.text()) && errors.push(m.text().slice(0, 200)));
      const rec = { mode, width, id: s.id, path: s.path, problems: [] };
      try {
        await page.goto(BASE + s.path, { waitUntil: 'load', timeout: 120_000 });
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        for (const c of s.click ?? []) {
          await page.locator(c).first().click({ timeout: 8000 });
          await page.waitForTimeout(500);
        }
        await page.waitForTimeout(s.wait ?? 400);
        const r = await page.evaluate(inPage, M.expect === 'dark');
        Object.assign(rec, { checked: r.checked, theme: r.theme, pref: r.pref, scope: r.scope, colorScheme: r.colorScheme, themeColor: r.themeColor, logos: r.logos });
        // Mechanics.
        if (r.scope === 'app') {
          if (r.theme !== M.expect) rec.problems.push(`data-theme is ${r.theme}, expected ${M.expect}`);
          if (r.colorScheme.length && !r.colorScheme.includes(M.meta)) rec.problems.push(`meta color-scheme ${r.colorScheme.join(' | ')}, expected ${M.meta}`);
          const wantScheme = M.expect === 'light' ? 'only light' : 'dark';
          const words = (s) => String(s).split(/\s+/).sort().join(' ');
          if (words(r.rootScheme) !== words(wantScheme)) rec.problems.push(`html color-scheme is "${r.rootScheme}", expected "${wantScheme}"`);
          const wrongLogo = r.logos.filter((src) => (M.expect === 'dark') !== /logo-light/.test(src));
          if (wrongLogo.length) rec.problems.push(`wrong wordmark for ${M.expect}: ${wrongLogo.join(', ')}`);
        }
        // Text and UI contrast.
        for (const f of r.text) rec.problems.push(`text ${f.ratio}:1 < ${f.need} "${f.text}" ${f.el} (${f.fg} on ${f.bg}${f.image ? ', over an image' : ''})`);
        for (const f of r.ui) rec.problems.push(`${f.what} ${f.ratio}:1 < 3 ${f.el} (${f.edge} on ${f.around})`);
        if (hasAxe) {
          await page.addScriptTag({ path: AXE });
          const axe = await page.evaluate(async () => {
            const res = await window.axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['violations'] });
            return res.violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\n').pop().slice(0, 160) })));
          });
          for (const a of axe) if (!rec.problems.some((p) => p.startsWith('text ') && p.includes(a.target.split(' ').pop()))) rec.problems.push(`axe: ${a.target} ${a.summary}`);
        }
        // Chrome's auto-dark: a probe painted in the page's own --bg must come out exactly that colour.
        if (M.force && r.scope) {
          const probe = await page.evaluate(() => {
            const d = document.createElement('div');
            d.id = 'hx-probe';
            d.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;background:var(--bg)';
            document.body.appendChild(d);
            return getComputedStyle(d).backgroundColor;
          });
          await page.waitForTimeout(100);
          const png = await page.screenshot({ clip: { x: 4, y: 4, width: 1, height: 1 } });
          const px = await page.evaluate(async (b64) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = c.height = 1;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
          }, png.toString('base64'));
          const want = probe.match(/\d+/g).slice(0, 3).map(Number);
          const off = Math.max(...want.map((v, i) => Math.abs(v - px[i])));
          rec.probe = { want, got: px };
          if (off > 6) rec.problems.push(`auto-darkened by Chrome: --bg ${probe} painted as rgb(${px.join(', ')})`);
          await page.evaluate(() => document.getElementById('hx-probe')?.remove());
          // The paper islands (.hx-light: documents, signature pads, QR codes) too: Chrome decides per element
          // (from its color-scheme), so a page it leaves alone can still have an island it repaints. The probe is
          // a child of the island (it inherits the island's scheme), fixed at the top left: no scrolling needed.
          const islands = await page.evaluate(() => document.querySelectorAll('.hx-light').length);
          for (let i = 0; i < Math.min(islands, 4); i++) {
            const spot = await page.evaluate((n) => {
              const el = [...document.querySelectorAll('.hx-light')][n];
              const box = el.getBoundingClientRect();
              if (box.width < 12 || box.height < 12 || getComputedStyle(el).visibility === 'hidden') return null;
              const d = document.createElement('div');
              d.id = 'hx-probe';
              d.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;background:var(--bg)';
              el.appendChild(d);
              const r = d.getBoundingClientRect();
              const inView = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && scrollX === 0 && scrollY === 0;
              return inView ? { x: r.left + 4, y: r.top + 4, color: getComputedStyle(d).backgroundColor, cls: el.className } : null;
            }, i);
            if (!spot) {
              await page.evaluate(() => document.getElementById('hx-probe')?.remove());
              continue;
            }
            await page.waitForTimeout(100);
            const shot = await page.screenshot({ clip: { x: Math.floor(spot.x), y: Math.floor(spot.y), width: 1, height: 1 } });
            const got = await page.evaluate(async (b64) => {
              const img = new Image();
              img.src = `data:image/png;base64,${b64}`;
              await img.decode();
              const c = document.createElement('canvas');
              c.width = c.height = 1;
              const g = c.getContext('2d');
              g.drawImage(img, 0, 0);
              return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
            }, shot.toString('base64'));
            const want = spot.color.match(/\d+/g).slice(0, 3).map(Number);
            if (Math.max(...want.map((v, k) => Math.abs(v - got[k]))) > 6) rec.problems.push(`auto-darkened by Chrome: paper island .${String(spot.cls).trim().split(/\s+/).join('.')} (${spot.color}) painted as rgb(${got.join(', ')})`);
            await page.evaluate(() => document.getElementById('hx-probe')?.remove());
          }
        }
        if (r.light.length) {
          rec.leftovers = r.light;
          if (STRICT) for (const l of r.light) rec.problems.push(`light patch ${l.el} ${l.bg} ${l.size}`);
        }
        // Script errors (hydration included) are listed; --errors-fail counts them as failures.
        if (errors.length) {
          rec.errors = errors;
          if (ERRORS_FAIL) for (const e of errors) rec.problems.push(`page error: ${e}`);
        }
        if (SHOTS) {
          const dir = path.join(OUT, mode, String(width));
          fs.mkdirSync(dir, { recursive: true });
          await page.screenshot({ path: path.join(dir, `${s.id}.png`), fullPage: s.full === true });
        }
      } catch (e) {
        rec.problems.push(`could not check: ${e.message.split('\n')[0].slice(0, 200)}`);
      }
      failures += rec.problems.length;
      results.push(rec);
      console.log(`${rec.problems.length ? 'FAIL' : 'ok  '} ${mode.padEnd(15)} ${String(width).padEnd(4)} ${s.id}${rec.problems.length ? '' : ` (${rec.checked} text elements)`}${rec.leftovers ? ` · ${rec.leftovers.length} light patches` : ''}${rec.errors && !ERRORS_FAIL ? ` · ${rec.errors.length} script error(s): ${rec.errors[0].slice(0, 90)}` : ''}`);
      for (const p of rec.problems.slice(0, 25)) console.log(`       ${p}`);
      if (rec.problems.length > 25) console.log(`       … ${rec.problems.length - 25} more`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'theme-contrast.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length} page renders, ${failures} problem(s). Details: ${path.join(OUT, 'theme-contrast.json')}`);
process.exit(failures ? 1 : 0);
