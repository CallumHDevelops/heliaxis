/**
 * The customer portal's service worker (scope /my), so phones offer to install it as an app. It keeps
 * nothing private: pages and /api always come from the network; only when there's no signal does a page
 * fall back to the site's offline page. Served from a route so each deploy is a new version.
 */
export const dynamic = 'force-dynamic';

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12);

const script = `
const CACHE = 'hx-my-' + ${JSON.stringify(VERSION)};
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).catch(() => null).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('hx-my-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())));
});
`;

export function GET() {
  return new Response(script, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/my' } });
}
