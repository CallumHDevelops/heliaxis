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
      { source: '/api/portal/:path*', headers: sensitiveHeaders },
      { source: '/api/rams/:path*', headers: sensitiveHeaders },
      { source: '/api/admin/:path*', headers: sensitiveHeaders },
      { source: '/reset-password', headers: sensitiveHeaders },
      { source: '/auth/:path*', headers: sensitiveHeaders },
      // SAMEORIGIN, not DENY: the CMS previews pages in same-origin iframes.
      { source: '/admin/:path*', headers: [...sensitiveHeaders, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
  transpilePackages: ['heatmap.js'],
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
