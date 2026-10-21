/**
 * Service worker for the site app (scope /portal/site, so the home page is covered too), cut down from the staff one (src/app/sw.js).
 * Served from a route so each deploy gets a new version string.
 *
 * - On install: keep the shell (/portal/site/shell, which carries no job data), the scan WASM, the
 *   icons and every /_next/static file the shell's HTML refers to.
 * - /_next/static, the icons and the WASM: cache-first.
 * - Pages under /portal/site: network-first. With no network the kept page (home) or the shell
 *   at once; on a weak signal the same after 6 s. Link pages (/j/<token>) are never kept.
 * - WARM (when a job pack downloads): fetch the shell again with its scripts; replies { ok }.
 * - A new version carries the last one's pages and scripts over when it takes over.
 * - /api is never cached: the app keeps its own copy in IndexedDB.
 * - Background Sync 'site-sync' (Android): tell the open app to send what's waiting.
 * - The update waits for SKIP_WAITING from the app, which never sends it while a send is running.
 * Its caches are named hxsite-…, so the staff worker (which clears hx-…) leaves them alone.
 */
export const dynamic = 'force-dynamic';

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12);
const STATIC_IN_HTML = String.raw`/_next/static/[^"'\s\\)]+`;

const script = `
const VERSION = ${JSON.stringify(VERSION)};
const STATIC = 'hxsite-static-' + VERSION;
const PAGES = 'hxsite-pages-' + VERSION;
const SHELL = '/portal/site/shell';
const KEPT = ['/portal/site', SHELL];
const FILES = ['/portal/site/zxing_reader.wasm', '/portal/site/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/assets/heliaxis-logo-light.png', '/assets/heliaxis-logo.png'];
const STATIC_IN_HTML = new RegExp(${JSON.stringify(STATIC_IN_HTML)}, 'g');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const stat = await caches.open(STATIC);
    await Promise.all(FILES.map((f) => stat.add(f).catch(() => {})));
    await warm().catch(() => false);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k.startsWith('hxsite-') && k !== STATIC && k !== PAGES);
    await carryForward(old).catch(() => {});
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// A new deploy: keep the last version's pages and their scripts until fresh copies arrive, so a
// phone that updated in the yard still opens with no signal on the roof.
async function carryForward(old) {
  const pages = await caches.open(PAGES);
  const stat = await caches.open(STATIC);
  for (const name of old.filter((k) => k.startsWith('hxsite-pages-')).reverse()) {
    const from = await caches.open(name);
    const fromStatic = 'hxsite-static-' + name.slice('hxsite-pages-'.length);
    for (const req of await from.keys()) {
      if (await pages.match(req)) continue;
      const res = await from.match(req);
      if (!res) continue;
      const html = await res.clone().text();
      await pages.put(req, res);
      for (const a of new Set(html.match(STATIC_IN_HTML) || [])) {
        if (await stat.match(a)) continue;
        const hit = await caches.match(a, { cacheName: fromStatic });
        if (hit) await stat.put(a, hit);
      }
    }
    for (const f of FILES) {
      if (await stat.match(f)) continue;
      const hit = await caches.match(f, { cacheName: fromStatic });
      if (hit) await stat.put(f, hit);
    }
  }
}

// The kept pages, fetched fresh, with every script and stylesheet their HTML needs.
async function warm() {
  const pages = await caches.open(PAGES);
  const stat = await caches.open(STATIC);
  let ok = true;
  for (const path of KEPT) {
    try {
      const res = await fetch(path, { credentials: 'omit', headers: { Accept: 'text/html' } });
      if (!res.ok || res.redirected) { ok = false; continue; }
      const html = await res.clone().text();
      await pages.put(path, res);
      const assets = [...new Set(html.match(STATIC_IN_HTML) || [])];
      await Promise.all(assets.map((a) => stat.match(a).then((hit) => hit || stat.add(a))));
    } catch {
      ok = !!(await pages.match(path)) && ok;
    }
  }
  return ok;
}

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'WARM') {
    const port = event.ports && event.ports[0];
    event.waitUntil(warm().then((ok) => port && port.postMessage({ ok }), () => port && port.postMessage({ ok: false })));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'site-sync') return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: 'SITE_SYNC' }))));
});

const isStatic = (p) => p.startsWith('/_next/static/') || FILES.includes(p);
const pagePath = (url) => url.pathname.replace(/\\/$/, '') || '/';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (isStatic(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then((c) =>
        c.match(req, { ignoreSearch: url.pathname === '/portal/site/manifest.webmanifest' }).then((hit) =>
          hit || fetch(req).then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  if (req.mode !== 'navigate' || !url.pathname.startsWith('/portal/site')) return;
  const path = pagePath(url);
  const keep = KEPT.includes(path);
  const network = fetch(req).then((res) => {
    if (keep && res.ok && !res.redirected) {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(path, copy));
    }
    return res;
  });
  const copy = async () => (keep && (await caches.match(path, { cacheName: PAGES }))) || (await caches.match(SHELL, { cacheName: PAGES }));
  event.respondWith(
    new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
      const timer = setTimeout(async () => finish(await copy()), 6000);
      network.then(
        (res) => { clearTimeout(timer); finish(res); },
        async () => { clearTimeout(timer); finish((await copy()) || Response.error()); }
      );
    })
  );
  event.waitUntil(network.catch(() => {}));
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      // The home page is /portal/site (no slash), which a /portal/site/ scope wouldn't cover.
      'Service-Worker-Allowed': '/portal/site',
    },
  });
}
