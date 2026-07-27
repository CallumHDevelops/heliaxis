/**
 * Who counts as a Post Studio admin.
 *
 * Reuses the project-wide ADMIN_EMAIL (already set on Vercel) by default, but
 * you can set POST_STUDIO_ADMIN_EMAILS (comma-separated) to control the studio's
 * admins independently of the marketing site. Comparison is case-insensitive.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const raw = process.env.POST_STUDIO_ADMIN_EMAILS || process.env.ADMIN_EMAIL || '';
  const admins = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
