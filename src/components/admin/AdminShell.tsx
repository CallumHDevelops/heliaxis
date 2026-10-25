import type { ReactNode } from 'react';
import Link from 'next/link';
import { signOut } from '@/lib/auth-actions';
import { brand } from '@/components/auth/authStyles';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { schemaReady } from '@/lib/schema-ready';
import { unreadPeople } from '@/lib/whatsapp/active';
import { AppRuntime } from './AppRuntime';
import { HeaderSearch } from './GlobalSearch';
import { HeaderUser } from './HeaderUser';
import { HelpTile } from './HelpLinks';
import { MoreMenu } from './MoreMenu';
import { TopMenu } from './TopMenu';
import { DockChip } from './whatsapp/DockChip';
import './admin-shell.css';

type Tab =
  | 'dashboard'
  | 'enquiries'
  | 'crm'
  | 'projects'
  | 'orders'
  | 'surveys'
  | 'whatsapp'
  | 'approvals'
  | 'users'
  | 'blog'
  | 'analytics'
  | 'heatmap'
  | 'subcontractors'
  | 'tasks'
  | 'assistant'
  | 'design'
  | 'social'
  | 'app'
  | 'help';

// Open RAMS and the social studio already signed in when they can (src/lib/sso.ts).
const RAMS_URL = '/api/sso/rams';
const SOCIAL_URL = '/api/sso/social';

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
/** The app's icons: the menus' and the Help sections' (a section's `icon`, src/content/help). */
export const icons = {
  home: (
    <svg {...ICON}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  tasks: (
    <svg {...ICON}>
      <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  ),
  enquiries: (
    <svg {...ICON}>
      <path d="M4 4h16v12H8l-4 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  ),
  whatsapp: (
    <svg {...ICON}>
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6z" />
      <path d="M9 9.5c.3 1.8 1.7 3.6 3.6 4.4l1.2-1 1.7.8-.4 1.3c-2.9.3-6.4-2.8-6.6-5.8l1.3-.4.8 1.7z" />
    </svg>
  ),
  templates: (
    <svg {...ICON}>
      <path d="M4 4h16v12H9l-5 4z" />
      <path d="m8.5 10 2.5 2.5 4.5-4.5" />
    </svg>
  ),
  rams: (
    <svg {...ICON}>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <path d="M2.5 15h19v2.5h-19z" />
      <path d="M10 7.3V5h4v2.3" />
    </svg>
  ),
  crm: (
    <svg {...ICON}>
      <path d="M3 7h18v12H3z" />
      <path d="M8 7V5h8v2M3 12h18" />
    </svg>
  ),
  more: (
    <svg {...ICON}>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </svg>
  ),
  close: (
    <svg {...ICON}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  // The "More" sheet's tiles.
  projects: (
    <svg {...ICON}>
      <path d="M4 4v16h16" />
      <path d="M8 8h6M10 12h7M8 16h5" />
    </svg>
  ),
  socialMonitoring: (
    <svg {...ICON}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  orders: (
    <svg {...ICON}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  ),
  surveys: (
    <svg {...ICON}>
      <path d="M9 3.5h6v3H9z" />
      <path d="M15 5h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  ),
  replies: (
    <svg {...ICON}>
      <path d="M10 8.5 5 13l5 4.5" />
      <path d="M5 13h9.5a4.5 4.5 0 0 1 4.5 4.5V19" />
      <path d="M17 3.5v4M15 5.5h4" />
    </svg>
  ),
  reports: (
    <svg {...ICON}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17v-3M13 17V8M18 17v-6" />
    </svg>
  ),
  settings: (
    <svg {...ICON}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  ),
  metis: (
    <svg {...ICON}>
      <path d="M11 3.5c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6z" />
      <path d="M18.5 15v5M16 17.5h5" />
    </svg>
  ),
  subcontractors: (
    <svg {...ICON}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />
    </svg>
  ),
  team: (
    <svg {...ICON}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18.5 14.3A6.5 6.5 0 0 1 21.5 20" />
    </svg>
  ),
  cms: (
    <svg {...ICON}>
      <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 9h18M7 13h10M7 16.5h6" />
    </svg>
  ),
  blog: (
    <svg {...ICON}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  analytics: (
    <svg {...ICON}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  ),
  heatmap: (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </svg>
  ),
  social: (
    <svg {...ICON}>
      <circle cx="18" cy="5" r="2.8" />
      <circle cx="6" cy="12" r="2.8" />
      <circle cx="18" cy="19" r="2.8" />
      <path d="M8.5 13.4l7 4.2M15.5 6.4l-7 4.2" />
    </svg>
  ),
  app: (
    <svg {...ICON}>
      <path d="M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5z" />
      <path d="M12 7v6M9.5 10.5 12 13l2.5-2.5M11 18.5h2" />
    </svg>
  ),
  design: (
    <svg {...ICON}>
      <path d="M4.5 19.5 8 18.8 18.2 8.6a2.2 2.2 0 0 0-3.1-3.1L4.9 15.7z" />
      <path d="m13.5 6.5 3.1 3.1M4.9 15.7 8 18.8" />
    </svg>
  ),
  help: (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.4a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4" />
      <path d="M12 17.3h.01" />
    </svg>
  ),
};
export type IconName = keyof typeof icons;

/** Phone bottom bar: one tab, icon over label. */
function TabLink({
  href,
  label,
  active,
  icon,
  badge,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  badge?: number;
}) {
  const body = (
    <>
      <span className="hx-tab__icon">
        {icon}
        {badge ? <span className="hx-tab__badge">{badge > 9 ? '9+' : badge}</span> : null}
      </span>
      <span className="hx-tab__label">{label}</span>
    </>
  );
  const cls = active ? 'hx-tab is-active' : 'hx-tab';
  // Not a page here (e.g. /api/sso/rams): a plain link, so it's never prefetched.
  if (href.startsWith('/api/') || /^https?:/.test(href)) return <a href={href} className={cls}>{body}</a>;
  return (
    <Link href={href} className={cls} aria-current={active ? 'page' : undefined}>
      {body}
    </Link>
  );
}

/** A page in the menus: an item in a desktop dropdown and, unless it's a bottom tab, a phone "More" tile. */
type NavItem = {
  href: string;
  label: string;
  /** What the tile says when the full name is too long for it. */
  short?: string;
  icon: ReactNode;
  /** Highlights the phone tile (the desktop menu goes by the URL). */
  active?: boolean;
  show: boolean;
  /** On the phone bottom bar, so left out of "More". */
  tab?: boolean;
  /** A full page load from the desktop menu too (the CMS's own stylesheet would stay on after a soft one). */
  reload?: boolean;
  /** A count beside it in the desktop menu (and on its group's button). */
  badge?: number;
  /** Kept up to date in the browser: 'wa' = people with unread WhatsApp messages (the dock's hx:wa-counts). */
  liveBadge?: 'wa';
};

/** One tile in the phone "More" sheet: icon over a short label. A plain link (a full page load), as before. */
function MoreTile({ href, label, short, icon, active }: NavItem) {
  return (
    <a
      href={href}
      className={active ? 'hx-tile is-active' : 'hx-tile'}
      aria-current={active ? 'page' : undefined}
      aria-label={short ? label : undefined}
    >
      <span className="hx-tile__icon">{icon}</span>
      <span className="hx-tile__label">{short ?? label}</span>
    </a>
  );
}

/** "Esther Smith" → "ES", "callum@…" → "C". */
function initialsOf(name: string) {
  const words = name.split('@')[0].split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export async function AdminShell({
  active,
  children,
  wide,
  fluid,
  flush,
}: {
  active: Tab;
  /** @deprecated nav now reads the signed-in profile itself. */
  isAdmin?: boolean;
  children: ReactNode;
  /** Wider main column (e.g. analytics embed). */
  wide?: boolean;
  /** Uses the screen, up to 1680px — for boards, tables and lists (the CRM, enquiries, WhatsApp). */
  fluid?: boolean;
  /** Edge-to-edge main (no max-width / side padding) — for full iframe pages. */
  flush?: boolean;
}) {
  // Nav shows only what this person can open (see /admin/users).
  const { profile } = await getSessionProfile();
  const can = (k: Parameters<typeof canAccess>[1]) => canAccess(profile, k);
  const admin = profile?.role === 'admin';
  const displayName = profile?.full_name || profile?.email || 'Account';
  const initials = initialsOf(displayName);
  // People with unread WhatsApp messages, once per number: every chat for Enquiries staff, chats with
  // a job for CRM staff (who use /admin/crm/chats instead of the inbox).
  const chats = can('enquiries') || can('crm');
  // Fetched together: they don't depend on each other, and every admin page waits for both.
  const [waUnread, ready] = await Promise.all([chats ? unreadPeople(can('enquiries') ? 'all' : 'linked') : 0, schemaReady()]);
  const waHref = can('enquiries') ? '/admin/enquiries/inbox' : '/admin/crm/chats';
  // Purchase orders: once purchase-orders.sql has been run (checked once a minute).
  const orders = can('crm') && ready.purchaseOrders;
  // Social Monitoring: once social-monitoring.sql has been run.
  const socialMonitoring = can('social_monitoring') && ready.social;

  const tasksIsTab = !can('crm') && !can('enquiries') && can('tasks');
  const enquiriesIsTab = !can('crm') && can('enquiries');
  // Both menus, in groups: the desktop header's dropdowns and the phone "More" sheet (less what's
  // on the bottom bar). A new page is one entry here; empty groups are left out of both.
  // `dropdown`: stays a dropdown under its own name even with one page in it (a group of one is
  // otherwise a plain link named after that page).
  const groups: { id: string; label: string; items: NavItem[]; dropdown?: boolean }[] = [
    {
      id: 'home',
      label: 'Dashboard',
      items: [{ href: '/admin', label: 'Dashboard', icon: icons.home, show: true, tab: true }],
    },
    {
      id: 'crm',
      label: 'CRM',
      items: [
        { href: '/admin/crm', label: 'Pipeline', icon: icons.crm, show: can('crm'), tab: true },
        { href: '/admin/crm/organisations', label: 'Organisations', icon: <svg {...ICON}><path d="M4 21V4l9-1v18M13 8h7v13M7.5 8h2M7.5 12h2M7.5 16h2M16 12h1.5M16 16h1.5M2 21h20" /></svg>, show: can('crm') },
        { href: '/admin/surveys', label: 'Surveys and diary', icon: icons.surveys, active: active === 'surveys', show: can('crm') },
        { href: '/admin/enquiries', label: 'Enquiries', icon: icons.enquiries, active: active === 'enquiries', show: can('enquiries'), tab: enquiriesIsTab },
        { href: '/admin/enquiries/inbox', label: 'WhatsApp inbox', icon: icons.whatsapp, show: can('enquiries'), tab: true, badge: waUnread, liveBadge: 'wa' },
        { href: '/admin/crm/chats', label: 'WhatsApp chats', icon: icons.whatsapp, show: !can('enquiries') && can('crm'), tab: true, badge: waUnread, liveBadge: 'wa' },
        { href: '/admin/enquiries/smart-replies', label: 'Smart replies & chasers', short: 'Smart replies', icon: icons.replies, show: can('enquiries') },
        { href: '/admin/enquiries/templates', label: 'WhatsApp templates', short: 'Templates', icon: icons.templates, show: can('enquiries') },
        { href: '/admin/crm/reports', label: 'CRM reports', icon: icons.reports, show: can('crm') },
        { href: '/admin/crm/settings', label: 'CRM settings', icon: icons.settings, show: can('crm') },
        { href: '/admin/assistant', label: 'Metis', icon: icons.metis, active: active === 'assistant', show: can('crm') },
      ],
    },
    {
      // The jobs once they're won (Projects: list, schedule, board and each job's page) and RAMS for site.
      // Always "Operations", even for someone with only one of the two (CRM staff without RAMS access,
      // or RAMS only), so "Operations › Projects" is the way there for everyone.
      id: 'operations',
      label: 'Operations',
      dropdown: true,
      items: [
        { href: '/admin/projects', label: 'Projects', icon: icons.projects, active: active === 'projects', show: can('crm') },
        // On site: one tap away on the phone's bottom bar, so not in "More".
        { href: '/admin/social', label: 'Social monitoring', short: 'Social', icon: icons.socialMonitoring, active: active === 'social', show: socialMonitoring },
        { href: RAMS_URL, label: 'RAMS', icon: icons.rams, show: can('rams'), tab: true },
      ],
    },
    {
      // Purchase orders only for now (once purchase-orders.sql has run); still headed Finance.
      id: 'finance',
      label: 'Finance',
      dropdown: true,
      items: [
        { href: '/admin/projects/orders', label: 'Purchase orders', short: 'Orders', icon: icons.orders, active: active === 'orders', show: orders },
      ],
    },
    {
      id: 'team',
      label: 'Team',
      items: [
        { href: '/admin/tasks', label: 'Tasks', icon: icons.tasks, active: active === 'tasks', show: can('tasks'), tab: tasksIsTab },
        { href: '/admin/subcontractors', label: 'Subcontractors', icon: icons.subcontractors, active: active === 'subcontractors', show: can('subcontractors') },
        { href: '/api/sso/rams?next=%2Foperatives%3Fteam%3Dheliaxis', label: 'Our team', icon: icons.team, show: can('team') },
      ],
    },
    {
      id: 'cms',
      label: 'CMS',
      items: [
        { href: '/admin/cms', label: 'Manage CMS', icon: icons.cms, show: can('cms'), reload: true },
        { href: '/admin/blog', label: 'Blog', icon: icons.blog, active: active === 'blog', show: can('cms') },
        { href: '/admin/analytics', label: 'Website analytics', icon: icons.analytics, active: active === 'analytics', show: can('analytics') },
        { href: '/admin/analytics/heatmap', label: 'Heatmap', icon: icons.heatmap, active: active === 'heatmap', show: can('analytics') },
      ],
    },
    {
      id: 'apps',
      label: 'Apps',
      items: [
        { href: '/admin/design', label: 'Design studio', short: 'Design', icon: icons.design, active: active === 'design', show: can('design') },
        { href: SOCIAL_URL, label: 'Social media studio', short: 'Social media', icon: icons.social, show: can('social') },
        { href: '/admin/app', label: 'Get the app', icon: icons.app, active: active === 'app', show: true },
      ],
    },
  ];
  const pick = (keep: (i: NavItem) => boolean) =>
    groups.map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length > 0);
  // Each icon goes to the (client) menu inside a span made here: passed bare, React's dev build warns about keys.
  const menu = pick((i) => i.show).map((g) => ({
    ...g,
    items: g.items.map(({ href, label, icon, reload, badge, liveBadge }) => ({
      href,
      label,
      reload,
      badge,
      liveBadge,
      icon: <span className="hx-dd__icon">{icon}</span>,
    })),
  }));
  const sheet = pick((i) => i.show && !i.tab);
  const tiles = sheet.flatMap((g) => g.items);
  // Two rows or fewer need no headings: one grid.
  const more = tiles.length > 6 ? sheet : [{ id: 'all', label: '', items: tiles }];
  const moreActive = tiles.some((i) => i.active) || active === 'help';
  return (
    <div
      className={flush ? 'admin-shell admin-shell--flush' : 'admin-shell'}
      style={{
        minHeight: flush ? undefined : '100vh',
        height: flush ? '100vh' : undefined,
        maxHeight: flush ? '100vh' : undefined,
        overflow: flush ? 'hidden' : undefined,
        display: 'flex',
        flexDirection: 'column',
        // The page colour (light or dark) and the soft glow on top are in admin-shell.css; full-height
        // embeds (flush) sit on near-black in both themes.
        backgroundColor: flush ? '#111' : undefined,
        fontFamily: brand.body,
        color: 'var(--text)',
      }}
    >
      <header className="hx-header">
        <Link href="/admin" className="hx-header__logo">
          <BrandLogo width="100%" />
        </Link>
        <nav className="hx-nav" aria-label="Main">
          <TopMenu groups={menu} fallback={active === 'dashboard' ? '/admin' : undefined} />
          {/* Search customers and projects (and Ctrl/⌘+K) from any page; desktop only, CSS hides it on phones. */}
          {(can('enquiries') || can('crm')) && <HeaderSearch />}
          {/* Tablets: opens the WhatsApp dock over the page (CSS shows it only there, on pages with the dock). */}
          {chats && <DockChip initial={waUnread} />}
          <HeaderUser initials={initials} name={displayName} email={profile?.email ?? ''} signOut={signOut} admin={admin} />
        </nav>
      </header>

      <main
        className={
          flush ? 'admin-shell__main admin-shell__main--flush' : fluid ? 'admin-shell__main admin-shell__main--fluid' : 'admin-shell__main'
        }
        style={
          flush
            ? {
                flex: '1 1 auto',
                width: '100%',
                maxWidth: 'none',
                margin: 0,
                padding: 0,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }
            : {
                // width: 100% — auto margins on a flex item stop it stretching, which
                // otherwise shrink-wraps the page to its content.
                width: '100%',
                boxSizing: 'border-box',
                maxWidth: fluid ? 1680 : wide ? 1200 : 1000,
                margin: '0 auto',
                // Padding lives in admin-shell.css so phones can tighten it and clear the tab bar.
              }
        }
      >
        {children}
      </main>
      {/* Phones: app-style tabs along the bottom instead of the header menu. */}
      <nav className={flush ? 'hx-tabs hx-tabs--static' : 'hx-tabs'} aria-label="Sections">
        <TabLink href="/admin" label="Home" icon={icons.home} active={active === 'dashboard'} />
        {can('crm') ? (
          <TabLink href="/admin/crm" label="CRM" icon={icons.crm} active={active === 'crm'} />
        ) : can('enquiries') ? (
          <TabLink href="/admin/enquiries" label="Enquiries" icon={icons.enquiries} active={active === 'enquiries'} />
        ) : (
          can('tasks') && <TabLink href="/admin/tasks" label="Tasks" icon={icons.tasks} active={active === 'tasks'} />
        )}
        {chats && (
          <TabLink
            href={waHref}
            label="WhatsApp"
            icon={icons.whatsapp}
            active={active === 'whatsapp'}
            badge={waUnread}
          />
        )}
        {/* On site: RAMS one tap away. */}
        {can('rams') && <TabLink href={RAMS_URL} label="RAMS" icon={icons.rams} active={false} />}
        {/* Always there: Help (for the page you're on) is the sheet's last tile. */}
        <MoreMenu>
          {/* Turns into "Close" while the sheet is open. */}
          <summary className={moreActive ? 'hx-tab is-active' : 'hx-tab'}>
            <span className="hx-tab__icon">
              <span className="hx-more__shut">{icons.more}</span>
              <span className="hx-more__open">{icons.close}</span>
            </span>
            <span className="hx-tab__label">
              <span className="hx-more__shut">More</span>
              <span className="hx-more__open">Close</span>
            </span>
          </summary>
          <div className="hx-more__sheet">
            {more.map((g) => (
              <div
                key={g.id}
                // A headed group of one tile takes one column, so Operations and Finance sit side by side.
                className={g.label && g.items.length === 1 ? 'hx-more__group hx-more__group--one' : 'hx-more__group'}
                role={g.label ? 'group' : undefined}
                aria-labelledby={g.label ? `hx-more-${g.id}` : undefined}
              >
                {g.label && (
                  <p id={`hx-more-${g.id}`} className="hx-more__title">
                    {g.label}
                  </p>
                )}
                <div className="hx-more__grid">
                  {g.items.map((i) => (
                    <MoreTile key={i.href} {...i} />
                  ))}
                  {!g.label && <HelpTile icon={icons.help} />}
                </div>
              </div>
            ))}
            {more.some((g) => g.label) && (
              <div className="hx-more__group hx-more__group--one" role="group" aria-labelledby="hx-more-help">
                <p id="hx-more-help" className="hx-more__title">
                  Help
                </p>
                <div className="hx-more__grid">
                  <HelpTile icon={icons.help} />
                </div>
              </div>
            )}
          </div>
        </MoreMenu>
      </nav>
      <AppRuntime surveys={can('crm')} />
    </div>
  );
}
