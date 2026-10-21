/**
 * The site app's web app manifest. Opened from a link, start_url is that link, so the Home Screen
 * app (which on an iPhone has its own storage) can sign itself in the first time it's opened.
 * The scope is /portal/site, with no slash, so the home page is inside it.
 */
export function siteManifest(startUrl: string) {
  return {
    id: '/portal/site/',
    name: 'Heliaxis Site',
    short_name: 'Heliaxis Site',
    description: 'Your Heliaxis jobs: job packs, questions and photos, with or without signal.',
    start_url: startUrl,
    scope: '/portal/site',
    display: 'standalone',
    orientation: 'portrait',
    // The launch screen is the ink of the top bar (the same in light and dark), not a white flash on a dark phone.
    background_color: '#211F18',
    theme_color: '#211F18',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

export const manifestResponse = (startUrl: string) =>
  new Response(JSON.stringify(siteManifest(startUrl)), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });

/** A site link token as the address carries it (the same shape tokens.ts makes). */
export const isLinkToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{30,100}$/.test(t);
