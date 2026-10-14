/**
 * Service worker for the staff app (/admin and the Android app, which opens /admin).
 * Served from a route so each deploy gets a new version string — that is what makes
 * open apps notice an update. Registered with scope /admin by AppRuntime.
 *
 * - /_next/static (hashed, immutable): cache-first.
 * - Pages in OFFLINE_PAGES: network-first, fall back to the last copy when offline.
 *   Only low-sensitivity pages are kept on the device (never subcontractor ID/bank data).
 * - Everything else under /admin: network, with /offline.html when there's no signal.
 * - /api is never cached here (Tasks keeps its own offline copy and outbox).
 */
export const dynamic = 'force-dynamic';

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12);

const OFFLINE_PAGES = ['/admin', '/admin/tasks', '/admin/app'];

const script = `
const VERSION = ${JSON.stringify(VERSION)};
const STATIC = 'hx-static-' + VERSION;
const PAGES = 'hx-pages-' + VERSION;
const OFFLINE_PAGES = ${JSON.stringify(OFFLINE_PAGES)};
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.add(OFFLINE_URL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hx-') && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'CLEAR') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('hx-')).map((k) => caches.delete(k)))));
  }
  if (msg.type === 'CACHE_URLS' && Array.isArray(msg.urls)) {
    event.waitUntil(
      caches.open(STATIC).then((c) =>
        Promise.all(msg.urls.filter(isStatic).map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => {}))))
      )
    );
  }
});

// Web Push (task assigned, task done …) — payload from src/lib/notify.ts.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Heliaxis', body: event.data && event.data.text() }; }
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'Heliaxis', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: data.id || undefined,
      data: { href: data.href || '/admin', id: data.id },
    });
    // Tell open pages to refresh the bell.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    open.forEach((c) => c.postMessage({ type: 'NOTIFICATION' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { href = '/admin', id } = event.notification.data || {};
  event.waitUntil((async () => {
    if (id) fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) }).catch(() => {});
    const target = new URL(href, self.location.origin).href;
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (win) {
      await win.focus();
      return win.navigate(target).catch(() => {});
    }
    return self.clients.openWindow(target);
  })());
});

function isStatic(url) {
  const p = new URL(url, self.location.origin).pathname;
  return p.startsWith('/_next/static/') || p.startsWith('/assets/');
}

function pagePath(url) {
  return url.pathname.replace(/\\/$/, '') || '/';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/app/')) return;

  if (isStatic(req.url)) {
    event.respondWith(
      caches.open(STATIC).then((c) =>
        c.match(req).then((hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) c.put(req, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }

  if (req.mode !== 'navigate') return;

  const keep = OFFLINE_PAGES.includes(pagePath(url));
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Don't keep redirects (e.g. to /login) or errors as the offline copy.
        if (keep && res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(pagePath(url), copy));
        }
        return res;
      })
      .catch(async () => {
        if (keep) {
          const hit = await caches.match(pagePath(url), { cacheName: PAGES });
          if (hit) return hit;
        }
        return (await caches.match(OFFLINE_URL)) || Response.error();
      })
  );
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
