/**
 * Heliaxis internal portals and who can open them.
 *
 * One user database (public.profiles). Admins can open everything and manage
 * users; members only get the portals ticked for them in /admin/users
 * (profiles.portals). Safe to import from middleware, server and client code.
 */

export type PortalKey = 'cms' | 'branding' | 'design' | 'tasks' | 'enquiries' | 'crm' | 'analytics' | 'subcontractors' | 'team' | 'social' | 'rams';

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
    key: 'branding',
    label: 'Brand guidelines',
    description: 'Logos, colours, fonts and usage rules — for workwear, print and partners.',
    href: '/branding',
    // Standalone, self-gated page (not under /admin) — no middleware paths.
    paths: [],
  },
  {
    key: 'design',
    label: 'Design studio',
    description: 'Design leaflets, business cards and banners on-brand — import a PDF, design over it, export print-ready PDF.',
    href: '/admin/design',
    paths: ['/admin/design'],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Shared to-do list — create, assign and set deadlines.',
    href: '/admin/tasks',
    paths: ['/admin/tasks'],
  },
  {
    key: 'enquiries',
    label: 'Enquiries',
    description: 'Quote requests from the website and their status.',
    href: '/admin/enquiries',
    paths: ['/admin/enquiries'],
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Contacts, opportunities, projects, surveys, the diary, site photos and every WhatsApp and email with the customer.',
    href: '/admin/crm',
    paths: ['/admin/crm', '/admin/assistant', '/admin/projects', '/admin/surveys'],
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
    // Through /api/sso/rams so it opens signed in (src/lib/sso.ts).
    href: '/api/sso/rams?next=%2Foperatives%3Fteam%3Dheliaxis',
    external: true,
    paths: [],
  },
  {
    key: 'social',
    label: 'Social media studio',
    description: 'Create and schedule social posts and reels.',
    // Through /api/sso/social so it opens signed in (src/lib/sso.ts).
    href: '/api/sso/social',
    external: true,
    paths: [],
  },
  {
    key: 'rams',
    label: 'RAMS',
    description: 'Risk assessments and method statements for jobs.',
    href: '/api/sso/rams',
    external: true,
    paths: [],
  },
];

export const PORTAL_KEYS = PORTALS.map((p) => p.key);

/** Admin-only areas — never grantable to members. */
export const ADMIN_ONLY_PATHS = ['/admin/users', '/admin/approvals', '/admin/setup'];

/**
 * The exceptions inside /admin/setup, open to every approved user: the guide and SQL viewers that
 * "From Claude" to-dos link to, since an admin can pass a to-do to a member. The rest (the Vercel
 * keys page) stays admin-only.
 */
export const OPEN_SETUP_PATHS = ['/admin/setup/guide', '/admin/setup/sql'];

/** The landing page after sign-in, open to every approved user. */
export const HUB_PATH = '/admin';

/** Also open to every approved user: the Android app download page. */
export const APP_PATH = '/admin/app';

/** Confirming your email before one-tap sign-in to RAMS or the social studio (src/lib/sso.ts): open to any approved user. */
export const SSO_PATH = '/admin/sso';

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
 * Which portal an /admin path belongs to: null = open to any approved user (the hub, setup guides),
 * 'admin' = admin only. Unknown /admin/<x> paths are old CMS page-editor links
 * (now /admin/cms/<x>) and are redirected there, so they count as the CMS.
 */
export function portalForPath(pathname: string): PortalKey | 'admin' | null {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p === HUB_PATH || p === APP_PATH || p === SSO_PATH || p.startsWith(`${SSO_PATH}/`)) return null;
  if (OPEN_SETUP_PATHS.some((a) => p.startsWith(`${a}/`))) return null;
  if (ADMIN_ONLY_PATHS.some((a) => p === a || p.startsWith(`${a}/`))) return 'admin';
  for (const portal of PORTALS) {
    if (portal.paths.some((a) => p === a || p.startsWith(`${a}/`))) return portal.key;
  }
  return 'cms';
}
