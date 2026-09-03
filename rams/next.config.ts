import path from 'node:path';
import type { NextConfig } from 'next';

function supabaseHostname(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    return raw ? new URL(raw).hostname || null : null;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseHostname();

const nextConfig: NextConfig = {
  // This app is self-contained; pin the trace root so a parent lockfile can't
  // pull the wrong directory in.
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https' as const,
            hostname: supabaseHost,
            port: '',
            pathname: '/storage/v1/object/**',
          },
        ]
      : [],
  },
};

export default nextConfig;
