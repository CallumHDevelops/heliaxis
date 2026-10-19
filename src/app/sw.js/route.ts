/**
 * Service worker for the staff app (/admin and the Android app, which opens /admin).
 * Served from a route so each deploy gets a new version string — that is what makes
 * open apps notice an update. Registered with scope /admin by AppRuntime.
 *
 * - /_next/static (hashed, immutable): cache-first.
 * - Pages in OFFLINE_PAGES: network-first, fall back to the last copy when offline.
 *   Only low-sensitivity pages are kept on the device (never subcontractor ID/bank data).
 * - Survey pages (SURVEY_PAGES and /admin/surveys/{id}) the same way; a survey with no copy yet opens
 *   the cached /admin/surveys/shell, which loads the survey from the phone (src/lib/surveys/offline.ts).
 *   On a weak signal a kept survey page falls back to its copy after a few seconds.
 * - WARM { urls } (from the survey offline pack): fetch and keep those pages, plus every
 *   /_next/static file their HTML refers to, so they open after a cold start with no signal.
 * - Everything else under /admin: network, with /offline.html when there's no signal.
 * - /api is never cached here (Tasks and Surveys keep their own offline copies and outboxes).
 */
export const dynamic = 'force-dynamic';

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12);

const OFFLINE_PAGES = ['/admin', '/admin/tasks', '/admin/app'];

// Solar surveys work with no signal. Not /report, /settings or /start.
const SURVEY_PAGES = ['/admin/surveys', '/admin/surveys/todo', '/admin/surveys/drafts', '/admin/surveys/done', '/admin/surveys/shell'];
const SURVEY_PAGE = '^/admin/surveys/[0-9a-fA-F-]{36}$';
const STATIC_IN_HTML = String.raw`/_next/static/[^"'\s\\)]+`;

const script = `
const VERSION = ${JSON.stringify(VERSION)};
const STATIC = 'hx-static-' + VERSION;
const PAGES = 'hx-pages-' + VERSION;
const OFFLINE_PAGES = ${JSON.stringify(OFFLINE_PAGES)};
const SURVEY_PAGES = ${JSON.stringify(SURVEY_PAGES)};
const SURVEY_PAGE = new RegExp(${JSON.stringify(SURVEY_PAGE)});
const SURVEY_SHELL = '/admin/surveys/shell';
const STATIC_IN_HTML = new RegExp(${JSON.stringify(STATIC_IN_HTML)}, 'g');
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
  if (msg.type === 'WARM' && Array.isArray(msg.urls)) event.waitUntil(warm(msg.urls));
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
      // One per WhatsApp chat: a new message replaces the old one and still buzzes.
      tag: data.tag || data.id || undefined,
      renotify: !!data.tag,
      vibrate: [120, 60, 120],
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : undefined,
      data: Object.assign({}, data.data || {}, { href: data.href || '/admin', id: data.id }),
    });
    if (typeof data.unread === 'number' && self.navigator.setAppBadge) self.navigator.setAppBadge(data.unread).catch(() => {});
    // Tell open pages to refresh the bell.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    open.forEach((c) => c.postMessage({ type: 'NOTIFICATION' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { href = '/admin', id, outboxId } = event.notification.data || {};
  // Buttons on a "smart reply queued" notification: act without opening the app.
  if ((event.action === 'outbox-send' || event.action === 'outbox-cancel') && outboxId) {
    event.waitUntil((async () => {
      if (id) fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) }).catch(() => {});
      const r = await fetch('/api/whatsapp/outbox/' + outboxId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: event.action === 'outbox-send' ? 'send-now' : 'cancel' }),
      }).catch(() => null);
      await self.registration.showNotification(
        r && r.ok ? (event.action === 'outbox-send' ? 'Reply sent' : 'Smart reply cancelled') : 'Couldn’t do that — open the chat',
        { body: '', icon: '/icon-192.png', badge: '/badge-96.png', tag: 'outbox-' + outboxId, data: { href } }
      );
    })());
    return;
  }
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

const isSurveyPage = (path) => SURVEY_PAGES.includes(path) || SURVEY_PAGE.test(path);
const keepPage = (path) => OFFLINE_PAGES.includes(path) || isSurveyPage(path);

// Fetch and keep pages for offline use, with the scripts and styles their HTML needs.
async function warm(urls) {
  const pages = await caches.open(PAGES);
  const stat = await caches.open(STATIC);
  for (const u of urls.slice(0, 40)) {
    try {
      const url = new URL(u, self.location.origin);
      const path = pagePath(url);
      if (url.origin !== self.location.origin || !keepPage(path)) continue;
      const res = await fetch(url.href, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      const assets = [...new Set(html.match(STATIC_IN_HTML) || [])];
      await Promise.all(assets.map((a) => stat.match(a).then((hit) => hit || stat.add(a).catch(() => {}))));
    } catch {}
  }
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

  const path = pagePath(url);
  const keep = keepPage(path);
  const network = fetch(req).then((res) => {
    // Don't keep redirects (e.g. to /login) or errors as the offline copy.
    if (keep && res.ok && !res.redirected) {
      const copy = res.clone();
      caches.open(PAGES).then((c) => c.put(path, copy));
    }
    return res;
  });
  const fallback = async () => {
    if (keep) {
      const hit = await caches.match(path, { cacheName: PAGES });
      if (hit) return hit;
      if (SURVEY_PAGE.test(path)) {
        const shell = await caches.match(SURVEY_SHELL, { cacheName: PAGES });
        if (shell) return shell;
      }
    }
    return (await caches.match(OFFLINE_URL)) || Response.error();
  };
  if (!isSurveyPage(path)) {
    event.respondWith(network.catch(fallback));
    return;
  }
  // Survey pages on a weak signal (on a roof, in a loft): use the copy after 6 s, keep it fresh meanwhile.
  event.respondWith(
    new Promise((resolve) => {
      let done = false;
      const finish = (r) => {
        if (!done) {
          done = true;
          resolve(r);
        }
      };
      const timer = setTimeout(async () => {
        const hit = (await caches.match(path, { cacheName: PAGES })) || (SURVEY_PAGE.test(path) && (await caches.match(SURVEY_SHELL, { cacheName: PAGES })));
        if (hit) finish(hit);
      }, 6000);
      network.then((res) => { clearTimeout(timer); finish(res); }, async () => { clearTimeout(timer); finish(await fallback()); });
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
    },
  });
}
