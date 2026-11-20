/**
 * The customer portal's web app manifest ("Add to Home Screen"). Scoped to /my, so it never mixes with the
 * public site or the staff app. From a project page the start URL is that project, so the installed icon
 * opens it straight away (whatever the phone kept); from /my it is the sign-in page, which reopens the
 * project this phone remembers.
 */
export function portalManifest(token?: string) {
  const start = token ? `/my/${token}?app=1` : '/my?app=1';
  return {
    id: token ? `/my/${token}` : '/my',
    name: 'My Heliaxis project',
    short_name: 'My Heliaxis',
    description: 'Your Heliaxis project: next steps, dates, documents, payments and help.',
    start_url: start,
    scope: '/my',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#211f18',
    theme_color: '#211f18',
    icons: [
      { src: '/my/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/my/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/my/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

export const manifestResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'private, max-age=3600' } });
