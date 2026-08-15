import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Heliaxis Post Studio',
    short_name: 'Post Studio',
    description: 'On-brand social posts & reels for Heliaxis.',
    start_url: '/studio',
    scope: '/',
    display: 'standalone',
    background_color: '#211F18',
    theme_color: '#211F18',
    orientation: 'any',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
