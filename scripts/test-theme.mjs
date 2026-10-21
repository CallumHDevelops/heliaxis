// Light and dark mode (src/lib/theme): which pages are themed, how a choice resolves, the metas each
// page declares, the account sync rule, the boot script that runs before first paint (in a sandbox
// with a fake page), setTheme's order of work and its account save, and the palette in
// src/app/theme.css against WCAG AA in both themes.
// Usage: node --experimental-strip-types scripts/test-theme.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import vm from 'node:vm';

// The theme modules import each other without the .ts on the end, and '@/…' as the app's bundler expects.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) specifier = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});

const shared = await import('../src/lib/theme/shared.ts');
const routes = await import('../src/lib/theme/routes.ts');
const {
  BOOT_SCRIPT,
  colorSchemeFor,
  parsePref,
  parseScheme,
  profileThemeToAdopt,
  resolveTheme,
  themeCookieOptions,
  THEME_LABELS,
  THEME_MAX_AGE,
} = shared;
const { decodeThemeRoute, encodeThemeRoute, SELF_ROUTE_SCRIPT, SITE_THEME_COLOR, themeRouteFor, themeViewportFor } = routes;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n  ${e.message.split('\n').join('\n  ')}`);
  }
}

/* ── Which pages are themed ─────────────────────────────────────────────────── */
await test('staff, trades, customers and sign-in pages follow the choice', () => {
  for (const p of ['/admin', '/admin/', '/admin/assistant', '/admin/crm/abc?tab=site', '/admin/design', '/admin/app']) {
    assert.deepEqual(themeRouteFor(p), { scope: 'app', bar: ['#FFFDF8', '#211F18'] }, p);
  }
  for (const p of ['/portal', '/portal/app/agreement', '/portal/site', '/portal/site/job/1/roof', '/portal/site/j/tok']) {
    assert.deepEqual(themeRouteFor(p), { scope: 'app', bar: ['#211F18', '#211F18'] }, p);
  }
  assert.equal(themeRouteFor('/my/portal-token-123')?.scope, 'app');
  assert.equal(themeRouteFor('/book/abcdef')?.scope, 'app');
  for (const p of ['/login', '/register', '/pending', '/forgot-password', '/reset-password', '/auth/confirm', '/get-app']) {
    assert.deepEqual(themeRouteFor(p), { scope: 'app', bar: ['#F7F2E7', '#171510'] }, p);
  }
});
await test('the CMS editor and its previews are pinned light', () => {
  for (const p of ['/admin/cms', '/admin/cms/home', '/admin/preview', '/admin/preview/x', '/admin/blog/preview', '/admin/blog/preview/my-post']) {
    assert.equal(themeRouteFor(p)?.scope, 'light', p);
  }
  // Not the blog list itself, and not a page that merely starts with "cms".
  assert.equal(themeRouteFor('/admin/blog')?.scope, 'app');
  assert.equal(themeRouteFor('/admin/cmsx')?.scope, 'app');
});
await test('the public website, /branding and /subcontractor-form are left alone', () => {
  for (const p of ['/', '/blog', '/blog/post', '/book-a-survey', '/book', '/my', '/branding', '/subcontractor-form', '/privacy-policy', '/administrator', '/portalx', '/loginx']) {
    assert.equal(themeRouteFor(p), null, p);
  }
});
await test('the route header round-trips, and junk is ignored', () => {
  for (const p of ['/admin', '/portal/site', '/login', '/admin/cms']) {
    assert.deepEqual(decodeThemeRoute(encodeThemeRoute(themeRouteFor(p))), themeRouteFor(p), p);
  }
  assert.equal(encodeThemeRoute(null), '');
  for (const h of ['', null, undefined, 'app', 'app #FFF #000', 'dark #FFFDF8 #211F18', 'app #FFFDF8 javascript:1', 'app red blue']) {
    assert.equal(decodeThemeRoute(h), null, String(h));
  }
});

/* ── Resolving a choice ─────────────────────────────────────────────────────── */
await test('choices and phone settings parse strictly', () => {
  assert.equal(parsePref('light'), 'light');
  assert.equal(parsePref('dark'), 'dark');
  assert.equal(parsePref('system'), 'system');
  for (const v of ['', 'Light', 'auto', 'blue', null, undefined, 1, {}]) assert.equal(parsePref(v), null, String(v));
  assert.equal(parseScheme('dark'), 'dark');
  assert.equal(parseScheme('system'), null);
});
await test('an explicit choice wins; Match phone uses the phone, or waits for the boot script', () => {
  assert.equal(resolveTheme('light', 'dark'), 'light');
  assert.equal(resolveTheme('dark', 'light'), 'dark');
  assert.equal(resolveTheme('system', 'dark'), 'dark');
  assert.equal(resolveTheme('system', 'light'), 'light');
  assert.equal(resolveTheme('system', null), undefined);
});
await test('explicit Light declares "only light" (plain "light" is still auto-darkened)', () => {
  assert.equal(colorSchemeFor('light'), 'only light');
  assert.equal(colorSchemeFor('dark'), 'dark');
  assert.equal(colorSchemeFor('system'), 'light dark');
});
await test('the toggle says Light / Dark / Match phone', () => {
  assert.deepEqual(THEME_LABELS, { light: 'Light', dark: 'Dark', system: 'Match phone' });
});

/* ── Metas per page and choice ──────────────────────────────────────────────── */
await test('viewport: website, pinned light, and each choice', () => {
  const admin = themeRouteFor('/admin');
  const site = themeRouteFor('/portal/site');
  assert.deepEqual(themeViewportFor(null, 'dark'), { themeColor: SITE_THEME_COLOR });
  assert.deepEqual(themeViewportFor(themeRouteFor('/admin/cms'), 'light'), { colorScheme: 'only light', themeColor: '#FFFDF8' });
  assert.deepEqual(themeViewportFor(admin, 'light'), { colorScheme: 'only light', themeColor: '#FFFDF8' });
  assert.deepEqual(themeViewportFor(admin, 'dark'), { colorScheme: 'dark', themeColor: '#211F18' });
  assert.deepEqual(themeViewportFor(admin, 'system'), {
    colorScheme: 'light dark',
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: '#FFFDF8' },
      { media: '(prefers-color-scheme: dark)', color: '#211F18' },
    ],
  });
  // The same bar in both themes needs no pair.
  assert.deepEqual(themeViewportFor(site, 'system'), { colorScheme: 'light dark', themeColor: '#211F18' });
});

/* ── Cookies ────────────────────────────────────────────────────────────────── */
await test('server-set theme cookies: whole site, 400 days, readable by the boot script', () => {
  assert.equal(THEME_MAX_AGE, 400 * 24 * 3600);
  assert.deepEqual(themeCookieOptions(true), { path: '/', maxAge: THEME_MAX_AGE, sameSite: 'lax', httpOnly: false, secure: true });
  assert.equal(themeCookieOptions(false).secure, false);
});

/* ── Account sync (profiles.theme / theme_at, supabase/theme.sql) ───────────── */
await test('the account choice comes to a device with none', () => {
  assert.deepEqual(profileThemeToAdopt({ theme: 'dark', theme_at: '2026-10-21T10:00:00.000Z' }, {}), { pref: 'dark', at: Date.parse('2026-10-21T10:00:00.000Z') });
  assert.deepEqual(profileThemeToAdopt({ theme: 'light', theme_at: null }, { pref: null, at: null }), { pref: 'light', at: 0 });
});
await test('a newer account choice replaces an older device one; an older one never does', () => {
  const at = Date.parse('2026-10-21T10:00:00.000Z');
  assert.deepEqual(profileThemeToAdopt({ theme: 'dark', theme_at: '2026-10-21T10:00:00.000Z' }, { pref: 'light', at: String(at - 1) }), { pref: 'dark', at });
  // The device chose after the account copy (e.g. its save is still on the way): keep the device's.
  assert.equal(profileThemeToAdopt({ theme: 'dark', theme_at: '2026-10-21T10:00:00.000Z' }, { pref: 'light', at: String(at + 1) }), null);
  assert.equal(profileThemeToAdopt({ theme: 'dark', theme_at: '2026-10-21T10:00:00.000Z' }, { pref: 'light', at: String(at) }), null);
  // An account choice with no time never overrides a device's choice.
  assert.equal(profileThemeToAdopt({ theme: 'dark', theme_at: null }, { pref: 'light', at: null }), null);
});
await test('nothing happens before theme.sql, when they agree, or with junk', () => {
  assert.equal(profileThemeToAdopt({ status: 'approved' }, { pref: 'light', at: '1' }), null);
  assert.equal(profileThemeToAdopt(null, {}), null);
  assert.equal(profileThemeToAdopt({ theme: 'dark', theme_at: '2030-01-01T00:00:00Z' }, { pref: 'dark', at: '1' }), null);
  assert.equal(profileThemeToAdopt({ theme: 'sepia', theme_at: '2030-01-01T00:00:00Z' }, {}), null);
  // A junk device choice counts as none.
  assert.deepEqual(profileThemeToAdopt({ theme: 'system', theme_at: 'not a date' }, { pref: 'blue', at: 'x' }), { pref: 'system', at: 0 });
});

/* ── The boot script, in a fake page ────────────────────────────────────────── */
function fakePage({ scope = 'app', theme, pref, bar = '#FFFDF8 #211F18', cookies = {}, ls = {}, dark = false, https = false, metas = 2, lsThrows = false, path = '/admin', script = BOOT_SCRIPT } = {}) {
  const attrs = new Map();
  if (scope) attrs.set('data-theme-scope', scope);
  if (theme) attrs.set('data-theme', theme);
  if (pref) attrs.set('data-theme-pref', pref);
  if (bar) attrs.set('data-bar', bar);
  const jar = new Map(Object.entries(cookies));
  const writes = [];
  const listeners = {};
  const mq = { matches: dark, handlers: [], addEventListener: (t, f) => mq.handlers.push(f) };
  const store = new Map(Object.entries(ls));
  const meta = Array.from({ length: metas }, () => ({ content: 'server', setAttribute(k, v) { this[k] = v; } }));
  const events = [];
  const document = {
    documentElement: {
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      setAttribute: (k, v) => attrs.set(k, String(v)),
      removeAttribute: (k) => attrs.delete(k),
    },
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(s) {
      writes.push(s);
      const [kv] = s.split(';');
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    },
    querySelectorAll: (sel) => (sel === 'meta[name="theme-color"]' ? meta : []),
  };
  const localStorage = {
    getItem: (k) => {
      if (lsThrows) throw new Error('SecurityError');
      return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => {
      if (lsThrows) throw new Error('SecurityError');
      store.set(k, String(v));
    },
  };
  class Event {
    constructor(type) {
      this.type = type;
    }
  }
  const window = {
    matchMedia: (q) => (q === '(prefers-color-scheme: dark)' ? mq : { matches: false }),
    addEventListener: (t, f) => ((listeners[t] ||= []).push(f)),
    dispatchEvent: (e) => events.push(e.type),
  };
  const ctx = { document, localStorage, location: { protocol: https ? 'https:' : 'http:', pathname: path }, Event, window, RegExp };
  window.localStorage = localStorage;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return {
    attr: (k) => attrs.get(k),
    jar,
    writes,
    store,
    meta,
    events,
    fixed: () => ctx.window.__hxThemeFixed,
    flipPhone(isDark) {
      mq.matches = isDark;
      for (const f of mq.handlers) f();
    },
    fire(type, e) {
      for (const f of listeners[type] || []) f(e);
    },
  };
}

await test('boot script: ES5 only, never throws', () => {
  assert.doesNotMatch(BOOT_SCRIPT, /=>|\blet\b|\bconst\b|`|\?\.|\?\?/);
  new vm.Script(BOOT_SCRIPT);
  // A broken page (no documentElement) is survived.
  const ctx = vm.createContext({ document: {}, window: {} });
  vm.runInContext(BOOT_SCRIPT, ctx);
});
await test('boot script: first visit on a dark phone paints dark and remembers the phone', () => {
  const p = fakePage({ pref: 'system', dark: true });
  assert.equal(p.attr('data-theme'), 'dark');
  assert.equal(p.attr('data-theme-pref'), 'system');
  assert.equal(p.jar.get('hx-scheme'), 'dark');
  assert.equal(p.jar.has('hx-theme'), false, 'no choice is invented');
  assert.equal(p.fixed(), 1, 'the server could not know: ThemeSync updates the bar');
  assert.match(p.writes[0], /^hx-scheme=dark; Path=\/; Max-Age=34560000; SameSite=Lax$/);
  assert.deepEqual(p.meta.map((m) => m.content), ['server', 'server'], 'never touches metas while parsing');
});
await test('boot script: first visit on a light phone paints light', () => {
  const p = fakePage({ pref: 'system', dark: false });
  assert.equal(p.attr('data-theme'), 'light');
  assert.equal(p.jar.get('hx-scheme'), 'light');
});
await test('boot script: an explicit choice beats the phone, either way round', () => {
  const a = fakePage({ cookies: { 'hx-theme': 'light', 'hx-scheme': 'dark' }, theme: 'light', pref: 'light', dark: true });
  assert.equal(a.attr('data-theme'), 'light');
  assert.equal(a.fixed(), undefined, 'the server already painted it right');
  assert.equal(a.writes.length, 0, 'nothing to write');
  const b = fakePage({ cookies: { 'hx-theme': 'dark' }, theme: 'dark', pref: 'dark', dark: false });
  assert.equal(b.attr('data-theme'), 'dark');
  assert.equal(b.jar.get('hx-scheme'), 'light');
});
await test('boot script: a page from a cache (rendered as Match phone) comes back as the saved choice', () => {
  const p = fakePage({ cookies: { 'hx-theme': 'dark' }, pref: 'system', dark: false });
  assert.equal(p.attr('data-theme'), 'dark');
  assert.equal(p.attr('data-theme-pref'), 'dark');
  assert.equal(p.fixed(), 1);
});
await test('boot script: a lost cookie comes back from this device', () => {
  const p = fakePage({ ls: { 'hx-theme': 'dark' }, pref: 'system', dark: false });
  assert.equal(p.attr('data-theme'), 'dark');
  assert.equal(p.jar.get('hx-theme'), 'dark');
  assert.ok(p.writes.some((w) => /^hx-theme=dark; Path=\/; Max-Age=34560000; SameSite=Lax$/.test(w)));
});
await test('boot script: the cookie wins over this device, which catches up (the account sync sets the cookie)', () => {
  const p = fakePage({ cookies: { 'hx-theme': 'light' }, ls: { 'hx-theme': 'dark' }, dark: true });
  assert.equal(p.attr('data-theme'), 'light');
  assert.equal(p.store.get('hx-theme'), 'light');
});
await test('boot script: junk values mean Match phone; blocked storage is survived', () => {
  const p = fakePage({ cookies: { 'hx-theme': 'blue' }, ls: { 'hx-theme': 'sepia' }, dark: true });
  assert.equal(p.attr('data-theme'), 'dark');
  assert.equal(p.attr('data-theme-pref'), 'system');
  const q = fakePage({ lsThrows: true, dark: true });
  assert.equal(q.attr('data-theme'), 'dark');
});
await test('boot script: pinned-light pages stay light and write nothing', () => {
  const p = fakePage({ scope: 'light', theme: 'light', pref: 'light', cookies: { 'hx-theme': 'dark' }, dark: true });
  assert.equal(p.attr('data-theme'), 'light');
  assert.equal(p.writes.length, 0);
});
await test('boot script: pages that are not themed are untouched', () => {
  const p = fakePage({ scope: null, bar: null, cookies: { 'hx-theme': 'dark' }, dark: true });
  assert.equal(p.attr('data-theme'), undefined);
  assert.equal(p.writes.length, 0);
});
await test('boot script: Secure cookies on https', () => {
  const p = fakePage({ dark: true, https: true });
  assert.match(p.writes[0], /; Secure$/);
});
await test('boot script: the phone flipping while open follows Match phone, and moves the bar', () => {
  const p = fakePage({ pref: 'system', dark: false });
  p.flipPhone(true);
  assert.equal(p.attr('data-theme'), 'dark');
  assert.equal(p.jar.get('hx-scheme'), 'dark');
  assert.deepEqual(p.meta.map((m) => m.content), ['#211F18', '#211F18']);
  assert.deepEqual(p.events, ['hx:theme']);
  // With an explicit choice the page stays put (the phone is still remembered).
  const q = fakePage({ cookies: { 'hx-theme': 'light' }, theme: 'light', pref: 'light', dark: false });
  q.flipPhone(true);
  assert.equal(q.attr('data-theme'), 'light');
  assert.equal(q.jar.get('hx-scheme'), 'dark');
  assert.deepEqual(q.meta.map((m) => m.content), ['#FFFDF8', '#FFFDF8']);
});
await test('boot script: a choice made in another tab follows here', () => {
  const p = fakePage({ cookies: { 'hx-theme': 'light' }, theme: 'light', pref: 'light', dark: false });
  p.jar.set('hx-theme', 'dark'); // the other tab's setTheme wrote the shared cookie…
  p.fire('storage', { key: 'hx-theme', newValue: 'dark' }); // …and its localStorage
  assert.equal(p.attr('data-theme'), 'dark');
  assert.equal(p.attr('data-theme-pref'), 'dark');
  p.fire('storage', { key: 'other', newValue: 'light' });
  assert.equal(p.attr('data-theme'), 'dark');
});
await test('prerendered pages (site app home and shell) work out their own scope from the address', () => {
  const both = SELF_ROUTE_SCRIPT + BOOT_SCRIPT;
  assert.doesNotMatch(SELF_ROUTE_SCRIPT, /=>|\blet\b|\bconst\b|`|\?\.|\?\?/);
  const site = fakePage({ scope: null, bar: null, path: '/portal/site/shell', script: both, cookies: { 'hx-theme': 'dark' } });
  assert.equal(site.attr('data-theme-scope'), 'app');
  assert.equal(site.attr('data-bar'), '#211F18 #211F18');
  assert.equal(site.attr('data-theme'), 'dark');
  assert.equal(site.fixed(), 1, 'ThemeSync updates the bar after load');
  const home = fakePage({ scope: null, bar: null, path: '/portal/site/', script: both, dark: true });
  assert.equal(home.attr('data-theme'), 'dark');
  // Every address the table knows gets what themeRouteFor says.
  for (const p of ['/admin', '/admin/cms/x', '/my/abc', '/book/x', '/login', '/', '/blog', '/book-a-survey', '/branding']) {
    const page = fakePage({ scope: null, bar: null, path: p, script: SELF_ROUTE_SCRIPT });
    const r = themeRouteFor(p);
    assert.equal(page.attr('data-theme-scope'), r?.scope, p);
    assert.equal(page.attr('data-bar'), r ? r.bar.join(' ') : undefined, p);
  }
  // The server already said: left alone.
  const known = fakePage({ scope: 'light', bar: '#FFFDF8 #FFFDF8', path: '/admin', script: SELF_ROUTE_SCRIPT });
  assert.equal(known.attr('data-theme-scope'), 'light');
  // The server can't tell what to declare there: the layout and the scripts do.
  assert.deepEqual(themeViewportFor(undefined, 'system'), {});
});
await test('boot script: back/forward cache re-checks', () => {
  const p = fakePage({ cookies: { 'hx-theme': 'light' }, theme: 'light', pref: 'light' });
  p.jar.set('hx-theme', 'dark');
  p.fire('pageshow', { persisted: false });
  assert.equal(p.attr('data-theme'), 'light');
  p.fire('pageshow', { persisted: true });
  assert.equal(p.attr('data-theme'), 'dark');
});

/* ── setTheme (src/lib/theme/client.ts) in a fake browser ──────────────────── */
{
  const log = [];
  const attrs = new Map([['data-theme-scope', 'app'], ['data-theme', 'light'], ['data-theme-pref', 'system'], ['data-bar', '#FFFDF8 #211F18']]);
  const metas = { 'theme-color': [{ content: '#FFFDF8' }, { content: '#211F18' }], 'color-scheme': [{ content: 'light dark' }] };
  const posts = [];
  let release;
  const g = globalThis;
  const saved = {};
  for (const k of ['document', 'window', 'localStorage', 'location', 'navigator', 'requestAnimationFrame', 'fetch']) saved[k] = Object.getOwnPropertyDescriptor(g, k);
  const set = (k, v) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  set('document', {
    documentElement: {
      getAttribute: (k) => attrs.get(k) ?? null,
      setAttribute: (k, v) => {
        log.push(`attr ${k}=${v}`);
        attrs.set(k, v);
      },
      removeAttribute: (k) => {
        log.push(`remove ${k}`);
        attrs.delete(k);
      },
    },
    set cookie(s) {
      log.push(`cookie ${s.split(';')[0]}`);
    },
    get cookie() {
      return '';
    },
    querySelectorAll: (sel) => metas[/name="([^"]+)"/.exec(sel)[1]] ?? [],
  });
  const events = [];
  set('window', {
    matchMedia: () => ({ matches: true }),
    dispatchEvent: (e) => events.push(e.type),
    addEventListener: () => {},
  });
  const ls = new Map();
  set('localStorage', {
    setItem: (k, v) => {
      log.push(`ls ${k}=${v}`);
      ls.set(k, String(v));
    },
    getItem: (k) => ls.get(k) ?? null,
  });
  set('location', { protocol: 'https:' });
  set('navigator', { onLine: true });
  set('requestAnimationFrame', (f) => setTimeout(f, 0));
  set('fetch', (url, init) => {
    posts.push({ url, ...init, body: JSON.parse(init.body) });
    return new Promise((r) => (release = () => r({ ok: true })));
  });
  const { setTheme } = await import('../src/lib/theme/client.ts');

  await test('setTheme: cookies first, then this device, then the page and its metas', () => {
    setTheme('dark');
    const firstAttr = log.findIndex((l) => l.startsWith('attr '));
    const cookies = log.slice(0, firstAttr).filter((l) => l.startsWith('cookie '));
    assert.deepEqual(cookies.map((c) => c.split('=')[0]), ['cookie hx-theme', 'cookie hx-theme-at', 'cookie hx-scheme']);
    assert.ok(log.indexOf('ls hx-theme=dark') < firstAttr);
    assert.equal(attrs.get('data-theme'), 'dark');
    assert.equal(attrs.get('data-theme-pref'), 'dark');
    assert.deepEqual(metas['theme-color'].map((m) => m.content), ['#211F18', '#211F18']);
    assert.equal(metas['color-scheme'][0].content, 'dark');
    assert.deepEqual(events, ['hx:theme']);
    assert.ok(log.includes('attr data-theme-switching='), 'transitions held off while it flips');
  });
  await test('setTheme: Match phone on a dark phone paints dark and declares both', () => {
    setTheme('system');
    assert.equal(attrs.get('data-theme'), 'dark');
    assert.equal(attrs.get('data-theme-pref'), 'system');
    assert.equal(metas['color-scheme'][0].content, 'light dark');
    setTheme('light');
    assert.equal(attrs.get('data-theme'), 'light');
    assert.equal(metas['color-scheme'][0].content, 'only light');
  });
  await test('setTheme: one account save, the latest choice, after the changes stop; one at a time', async () => {
    assert.equal(posts.length, 0, 'not straight away');
    await new Promise((r) => setTimeout(r, 650));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, '/api/theme');
    assert.equal(posts[0].method, 'POST');
    assert.equal(posts[0].body.theme, 'light');
    assert.equal(typeof posts[0].body.at, 'number');
    setTheme('dark'); // while the first is still on its way
    await new Promise((r) => setTimeout(r, 650));
    assert.equal(posts.length, 1, 'waits for the first to finish');
    release();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(posts.length, 2);
    assert.equal(posts[1].body.theme, 'dark');
    release();
    assert.ok(log.includes('remove data-theme-switching'));
  });
  await test('setTheme: a newer choice (another tab) gets its cookies back after an older save lands', async () => {
    setTheme('light');
    await new Promise((r) => setTimeout(r, 650));
    assert.equal(posts.at(-1).body.theme, 'light');
    // Meanwhile another tab chose Dark (same localStorage); this tab's older response then lands.
    ls.set('hx-theme', 'dark');
    ls.set('hx-theme-at', String(posts.at(-1).body.at + 1000));
    const before = log.length;
    release();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(log.slice(before).filter((l) => l.startsWith('cookie ')), ['cookie hx-theme=dark', `cookie hx-theme-at=${posts.at(-1).body.at + 1000}`]);
  });
  await test('setTheme: does nothing on pages that are not themed', () => {
    attrs.set('data-theme-scope', 'light');
    const before = log.length;
    setTheme('dark');
    assert.equal(log.length, before);
  });
  for (const [k, d] of Object.entries(saved)) if (d) Object.defineProperty(g, k, d);
  else delete g[k];
}

/* ── The palette (src/app/theme.css) against WCAG AA ────────────────────────── */
const css = readFileSync(new URL('../src/app/theme.css', import.meta.url), 'utf8');
function block(selectorRe) {
  const m = selectorRe.exec(css);
  assert.ok(m, `block ${selectorRe}`);
  const body = css.slice(m.index + m[0].length, css.indexOf('}', m.index + m[0].length));
  const vars = {};
  for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  return vars;
}
const LIGHT = block(/:root,\s*\.hx-light\s*\{/);
const DARK = { ...LIGHT, ...block(/:root\[data-theme='dark'\],\s*\.hx-dark\s*\{/) };
const hex = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
function colour(v, t) {
  v = v.trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return colour(t[ref[1]], t);
  if (v.startsWith('#')) return { rgb: hex(v), a: 1 };
  const m = /^rgba?\(([^)]+)\)$/.exec(v);
  assert.ok(m, `not a colour: ${v}`);
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { rgb: p.slice(0, 3), a: p[3] ?? 1 };
}
const over = (c, base) => c.rgb.map((x, i) => x * c.a + base[i] * (1 - c.a));
const lum = (rgb) => {
  const s = rgb.map((x) => {
    x /= 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
// Screens show whole 8-bit values, so the composited colours are rounded first (as a browser paints them).
const ratio = (a, b) => {
  const [x, y] = [lum(a.map(Math.round)), lum(b.map(Math.round))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** fg on (bg over under): every colour is a token name. */
function cr(t, fg, bg, under = '--bg') {
  const base = over(colour(t[under], t), [0, 0, 0]);
  const b = over(colour(t[bg], t), base);
  return ratio(over(colour(t[fg], t), b), b);
}
await test('the dark block re-declares every colour the light one has (apart from the ink bands)', () => {
  const light = Object.keys(block(/:root,\s*\.hx-light\s*\{/));
  const dark = Object.keys(block(/:root\[data-theme='dark'\],\s*\.hx-dark\s*\{/));
  const missing = light.filter((k) => !dark.includes(k) && !k.startsWith('--moment'));
  assert.deepEqual(missing, []);
});
await test('no token refers to itself', () => {
  for (const [k, v] of Object.entries({ ...LIGHT, ...block(/:root\[data-theme='dark'\],\s*\.hx-dark\s*\{/) })) assert.ok(!v.includes(`var(${k})`), k);
});
for (const [name, t] of [['light', LIGHT], ['dark', DARK]]) {
  const S = ['--bg', '--surface', '--surface-2', '--raised', '--field'];
  const fails = [];
  const need = (fg, bg, min, under, note) => {
    const r = cr(t, fg, bg, under);
    if (r < min) fails.push(`${fg} on ${bg}${under && under !== bg ? ` over ${under}` : ''} = ${r.toFixed(2)} < ${min}${note ? ` (${note})` : ''}`);
  };
  // Text on every surface.
  for (const fg of ['--text', '--text-2', '--muted', '--accent-text', '--ok', '--warn', '--danger', '--info', '--wa-text', '--claude']) for (const s of S) need(fg, s, 4.5, s);
  // Status text on its own tint, over the surfaces it sits on.
  for (const st of ['--ok', '--warn', '--danger', '--info']) for (const s of ['--bg', '--surface', '--surface-2', '--raised']) need(st, `${st}-soft`, 4.5, s, 'status pill');
  for (const s of ['--bg', '--surface', '--surface-2', '--raised']) {
    need('--accent-text', '--accent-soft', 4.5, s, 'gold pill');
    need('--text-2', '--accent-soft', 4.5, s, 'banner');
    for (const tint of ['--accent-soft', '--warn-soft', '--ok-soft', '--info-soft', '--danger-soft']) need('--muted', tint, 4.5, s, 'small print on a tint');
  }
  for (const p of ['--ph-y', '--ph-b', '--ph-g', '--ph-lost']) for (const s of ['--surface', '--surface-2']) need(`${p}-text`, `${p}-bg`, 4.5, s, 'stage pill');
  need('--ph-done-text', '--ph-done', 4.5, '--surface', 'Complete pill');
  need('--text', '--wa-soft', 4.5, '--surface', 'chat bubble');
  need('--accent-ink', '--accent', 4.5, '--surface', 'primary button');
  need('--inverse-text', '--inverse', 4.5, '--surface', '"dark" button');
  need('--inverse-accent', '--inverse', 4.5, '--surface', 'gold-on-ink button');
  for (const f of ['--ok', '--danger', '--info', '--wa']) need('--on-solid', f, 4.5, '--surface', 'badge');
  need('--moment-text', '--moment', 4.5, '--moment', 'ink band');
  need('--moment-muted', '--moment', 4.5, '--moment', 'ink band');
  // Lines and marks that carry meaning (WCAG 1.4.11): 3:1.
  for (const s of ['--bg', '--surface', '--surface-2', '--raised', '--field']) need('--border-strong', s, 3, s, 'input edge');
  // An input's edge is drawn over its own fill and seen against what's round it.
  for (const fill of ['--field', '--surface', '--raised']) {
    for (const around of ['--bg', '--surface', '--surface-2', '--raised']) {
      const edge = over(colour(t['--border-strong'], t), over(colour(t[fill], t), over(colour(t[around], t), [0, 0, 0])));
      const r = ratio(edge, over(colour(t[around], t), [0, 0, 0]));
      if (r < 3) fails.push(`--border-strong over ${fill}, seen on ${around} = ${r.toFixed(2)} < 3 (input edge)`);
    }
  }
  for (const s of ['--bg', '--surface', '--surface-2', '--raised']) need('--focus', s, 3, s, 'focus ring');
  for (const s of ['--surface', '--surface-2', '--raised']) need('--accent-text', s, 3, s, 'edge of a selected gold pill');
  if (name === 'dark') for (const s of ['--bg', '--surface', '--surface-2']) need('--accent', s, 3, s, 'gold pill or dot on dark');
  await test(`${name} palette: every text pair is AA, every meaningful line 3:1`, () => assert.deepEqual(fails, []));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
