/** Validate a post-login redirect stays within /admin routes. */
export function safeAdminPath(path: string | null | undefined): string {
  const p = (path || '').trim();
  if (p.startsWith('/admin') && !p.startsWith('//')) return p;
  return '/admin';
}
