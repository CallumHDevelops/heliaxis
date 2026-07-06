import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    // Serve the new static marketing site (public/pages/*.html) at clean URLs.
    // `beforeFiles` runs before the App Router, so these take precedence over any
    // old page.tsx routes without deleting them (they remain reachable/reversible).
    return {
      beforeFiles: [
        { source: '/', destination: '/pages/home.html' },
        { source: '/commercial-funding', destination: '/pages/commercial-funding.html' },
        { source: '/newport-net-zero-grant', destination: '/pages/newport-net-zero-grant.html' },
        { source: '/warehousing', destination: '/pages/warehousing.html' },
        { source: '/solar-estimator', destination: '/pages/solar-estimator.html' },
        { source: '/roof-designer', destination: '/pages/roof-designer.html' },
        { source: '/admin', destination: '/pages/cms.html' },
      ],
    };
  },
};

export default nextConfig;
