/**
 * Which routes may send Umami pageviews / scroll events.
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

export function normalizeAnalyticsPath(input: string): string {
  if (!input) return '/';
  try {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return new URL(input).pathname || '/';
    }
  } catch {
    /* ignore */
  }
  const path = input.split('?')[0]?.split('#')[0] || '/';
  return path.startsWith('/') ? path : `/${path}`;
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
