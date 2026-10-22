import 'server-only';
import { getSessionProfile, guardAdmin } from '@/lib/auth';
import { canAccess, portalForPath, type PortalKey } from '@/lib/portals';

/**
 * Who's reading Help, for what the pages offer them: any approved user can read every article; the
 * "Open this page" button shows only when they can open that page, Ask Metis only for CRM staff (Metis
 * lives in the CRM).
 */
export async function helpViewer(nextPath: string) {
  await guardAdmin(nextPath);
  const { profile } = await getSessionProfile();
  const admin = profile?.role === 'admin';
  /** Has what an article's `access` asks for (any of the permissions listed). */
  const has = (access: string[]) =>
    access.includes('everyone') || (access.includes('admin') ? admin : access.some((k) => canAccess(profile, k as PortalKey)));
  /** Can open this app page (the same rule the middleware applies). */
  const canOpen = (path: string) => {
    const pathname = path.split(/[?#]/)[0];
    if (!pathname.startsWith('/admin')) return true;
    const need = portalForPath(pathname);
    return need === null || (need === 'admin' ? admin : canAccess(profile, need));
  };
  return { profile, admin, has, canOpen, metis: canAccess(profile, 'crm') };
}
