/**
 * Heliaxis internal portals and who can open them.
 *
 * One user database (public.profiles). Admins can open everything and manage
 * users; members only get the portals ticked for them in /admin/users
 * (profiles.portals). Safe to import from middleware, server and client code.
 */

export type PortalKey = 'cms' | 'enquiries' | 'analytics' | 'subcontractors' | 'team' | 'social' | 'rams';

export type Portal = {
  key: PortalKey;
  label: string;
  description: string;
  href: string;
  external?: boolean;
  /** Path prefixes inside this app that belong to the portal (for access checks). */
  paths: string[];
};

export const PORTALS: Portal[] = [
  {
    key: 'cms',
    label: 'Website CMS',
    description: 'Edit pages, menus, images and AI blogs on heliaxis.co.uk.',
    href: '/admin/cms',
    paths: ['/admin/cms', '/admin/blog', '/admin/preview'],
  },
  {
    key: 'enquiries',
    label: 'Enquiries',
    description: 'Quote requests from the website and their status.',
    href: '/admin/enquiries',
    paths: ['/admin/enquiries'],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Visitors, pages and click heatmaps.',
    href: '/admin/analytics',
    paths: ['/admin/analytics'],
  },
  {
    key: 'subcontractors',
    label: 'Subcontractors',
    description: 'Agreements, ID, qualifications, cards and insurance.',
    href: '/admin/subcontractors',
    paths: ['/admin/subcontractors'],
  },
  {
    key: 'team',
    label: 'Our team',
    description: 'Heliaxis’s own operatives — cards, qualifications and expiry dates (kept in RAMS).',
    // RAMS holds the one list of people (crews and RAMS documents name them); this opens it on our employees.
    href: 'https://rams.heliaxis.co.uk/operatives?team=heliaxis',
    external: true,
    paths: [],
  },
  {
    key: 'social',
    label: 'Social media studio',
    description: 'Create and schedule social posts and reels.',
    href: 'https://social.heliaxis.co.uk',
    external: true,
    paths: [],
  },
  {
    key: 'rams',
    label: 'RAMS',
    description: 'Risk assessments and method statements for jobs.',
    href: 'https://rams.heliaxis.co.uk',
    external: true,
    paths: [],
  },
];

export const PORTAL_KEYS = PORTALS.map((p) => p.key);

/** Admin-only areas — never grantable to members. */
export const ADMIN_ONLY_PATHS = ['/admin/users', '/admin/approvals'];

/** The landing page after sign-in, open to every approved user. */
export const HUB_PATH = '/admin';

/**
 * What members could reach before per-portal access existed. Used when a profile
 * has no `portals` column yet (migration not run) so nobody gets locked out.
 */
const LEGACY_MEMBER_PORTALS: PortalKey[] = ['cms', 'enquiries'];

export type AccessProfile = {
  role?: string | null;
  status?: string | null;
  portals?: string[] | null;
};

export function portalsFor(profile: AccessProfile | null | undefined): PortalKey[] {
  if (!profile || profile.status !== 'approved') return [];
  if (profile.role === 'admin') return [...PORTAL_KEYS];
  if (!Array.isArray(profile.portals)) return LEGACY_MEMBER_PORTALS;
  return profile.portals.filter((k): k is PortalKey => (PORTAL_KEYS as string[]).includes(k));
}

export function canAccess(profile: AccessProfile | null | undefined, key: PortalKey) {
  return portalsFor(profile).includes(key);
}

/**
 * Which portal an /admin path belongs to: null = open to any approved user (the hub),
 * 'admin' = admin only. Unknown /admin/<x> paths are old CMS page-editor links
 * (now /admin/cms/<x>) and are redirected there, so they count as the CMS.
 */
export function portalForPath(pathname: string): PortalKey | 'admin' | null {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === HUB_PATH) return null;
  if (ADMIN_ONLY_PATHS.some((a) => p === a || p.startsWith(`${a}/`))) return 'admin';
  for (const portal of PORTALS) {
    if (portal.paths.some((a) => p === a || p.startsWith(`${a}/`))) return portal.key;
  }
  return 'cms';
}
