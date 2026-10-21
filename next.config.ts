import type { NextConfig } from "next";

function supabaseHostname(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!raw) return null;
    return new URL(raw).hostname || null;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseHostname();

// Pages and APIs that handle ID, insurance, bank and signature data: never cached,
// never framed by another site, never indexed, and no Referer leaks.
const sensitiveHeaders = [
  { key: 'Cache-Control', value: 'no-store, max-age=0' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      { source: '/portal/:path*', headers: [...sensitiveHeaders, { key: 'X-Frame-Options', value: 'DENY' }] },
      { source: '/portal', headers: [...sensitiveHeaders, { key: 'X-Frame-Options', value: 'DENY' }] },
      // The site app on trades' phones: the camera (photos, scanning) and location (photo stamps, when
      // the owner turns them on) for its own pages only. Later entries win, so this replaces the
      // Permissions-Policy above; the other /portal pages keep the camera blocked.
      { source: '/portal/site', headers: [{ key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=()' }] },
      { source: '/portal/site/:path*', headers: [{ key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=()' }] },
      { source: '/api/portal/:path*', headers: sensitiveHeaders },
      { source: '/api/site/:path*', headers: sensitiveHeaders },
      // Survey booking links (/book/<token>) are personal. Not /book-a-survey, the public form.
      { source: '/book/:path*', headers: sensitiveHeaders },
      { source: '/api/book/:path*', headers: sensitiveHeaders },
      { source: '/api/rams/:path*', headers: sensitiveHeaders },
      { source: '/api/admin/:path*', headers: sensitiveHeaders },
      { source: '/reset-password', headers: sensitiveHeaders },
      { source: '/auth/:path*', headers: sensitiveHeaders },
      // SAMEORIGIN, not DENY: the CMS previews pages in same-origin iframes.
      { source: '/admin/:path*', headers: [...sensitiveHeaders, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
  transpilePackages: ['heatmap.js'],
  // Setup guides and SQL files, opened from the "From Claude" to-dos (src/lib/setup-files.ts).
  outputFileTracingIncludes: {
    '/api/setup/file': ['./supabase/*.sql'],
    '/admin/setup/**': ['./supabase/*.sql', './*.md'],
    // The logos and fonts of the document kit (src/lib/documents/pdf-kit.ts) wherever a document is made:
    // purchase orders, site paperwork, certificates, reports, the handover pack, and the print versions
    // made on request (the CRM's and the customer portal's document links). heliaxis-logo-doc.png on
    // paper, heliaxis-logo-doc-light.png on the dark bands.
    '/api/crm/purchase-orders/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/site/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/crm/site-assignments/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/crm/projects/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/crm/documents/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/crm/library/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/crm/settings/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/my/**': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
    '/api/cron/site': ['./public/assets/heliaxis-logo*.png', './public/assets/fonts/*.ttf'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      ...(supabaseHost
        ? [
            {
              protocol: 'https' as const,
              hostname: supabaseHost,
              port: '',
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
