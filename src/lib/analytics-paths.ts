/**
 * Which routes may send Umami pageviews / scroll events / click heatmaps.
 * Admin wants analytics about public visitors (site, blog, tools) — not CMS/auth usage.
 */

const BLOCKED_EXACT = new Set([
  '/login',
  '/register',
  '/pending',
  '/preview',
]);

const BLOCKED_PREFIXES = [
  '/admin',
  '/login/',
  '/register/',
  '/pending/',
  '/preview/',
  '/api/',
];

/** Fixed marketing routes that always exist (even with 0 clicks). */
export const STATIC_PUBLIC_PATHS = [
  '/',
  '/brand',
  '/blog',
  '/solar-estimator',
  '/roof-designer',
  '/commercial-funding',
  '/newport-net-zero-grant',
  '/warehousing',
  '/updates',
] as const;

export function normalizeAnalyticsPath(input: string): string {
  if (!input) return '/';
  try {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      input = new URL(input).pathname || '/';
    }
  } catch {
    /* ignore */
  }
  let path = input.split('?')[0]?.split('#')[0] || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  // Collapse trailing slash so /blog and /blog/ share one heatmap
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

/** True for public / user-facing pages only (home, blog, brand, tools, forms, etc.). */
export function isTrackableAnalyticsPath(pathnameOrUrl: string): boolean {
  const path = normalizeAnalyticsPath(pathnameOrUrl);
  if (BLOCKED_EXACT.has(path)) return false;
  for (const prefix of BLOCKED_PREFIXES) {
    if (path === prefix.replace(/\/$/, '') || path.startsWith(prefix)) return false;
  }
  return true;
}
