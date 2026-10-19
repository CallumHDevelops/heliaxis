import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signOut } from '@/lib/auth-actions';
import { brand } from '@/components/auth/authStyles';
import { getSessionProfile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppRuntime } from './AppRuntime';
import { HeaderUser } from './HeaderUser';
import { MoreMenu } from './MoreMenu';
import './admin-shell.css';

type Tab =
  | 'dashboard'
  | 'enquiries'
  | 'crm'
  | 'whatsapp'
  | 'approvals'
  | 'users'
  | 'blog'
  | 'analytics'
  | 'heatmap'
  | 'subcontractors'
  | 'tasks'
  | 'assistant'
  | 'app';

// Open RAMS and the social studio already signed in when they can (src/lib/sso.ts).
const RAMS_URL = '/api/sso/rams';
const SOCIAL_URL = '/api/sso/social';

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const icons = {
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
  users: (
    <svg {...ICON}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 11l2 2 4-4" />
    </svg>
  ),
  app: (
    <svg {...ICON}>
      <path d="M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5z" />
      <path d="M12 7v6M9.5 10.5 12 13l2.5-2.5M11 18.5h2" />
    </svg>
  ),
};

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a href={href} className={active ? 'hx-nav__link is-active' : 'hx-nav__link'}>
      {label}
    </a>
  );
}

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

type MoreItem = {
  href: string;
  label: string;
  /** What the tile says when the full name is too long for it. */
  short?: string;
  icon: ReactNode;
  active?: boolean;
  show: boolean;
};

/** One tile in the phone "More" sheet: icon over a short label. A plain link (a full page load), as before. */
function MoreTile({ href, label, short, icon, active }: MoreItem) {
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

/** Chats with unread WhatsApp messages (0 if the tables aren't there yet). */
async function whatsappUnread() {
  try {
    const { count } = await createAdminClient()
      .from('enquiries')
      .select('id', { count: 'exact', head: true })
      .gt('wa_unread', 0);
    return count ?? 0;
  } catch {
    return 0;
  }
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
  flush,
}: {
  active: Tab;
  /** @deprecated nav now reads the signed-in profile itself. */
  isAdmin?: boolean;
  children: ReactNode;
  /** Wider main column (e.g. analytics embed). */
  wide?: boolean;
  /** Edge-to-edge main (no max-width / side padding) — for full iframe pages. */
  flush?: boolean;
}) {
  // Nav shows only what this person can open (see /admin/users).
  const { profile } = await getSessionProfile();
  const can = (k: Parameters<typeof canAccess>[1]) => canAccess(profile, k);
  const admin = profile?.role === 'admin';
  const displayName = profile?.full_name || profile?.email || 'Account';
  const initials = initialsOf(displayName);
  const waUnread = can('enquiries') ? await whatsappUnread() : 0;

  // Desktop menu (all of it).
  type Item = { href: string; label: string; active: boolean; show: boolean };
  const items: Item[] = [
    { href: '/admin', label: 'Dashboard', active: active === 'dashboard', show: true },
    { href: '/admin/cms', label: 'CMS', active: false, show: can('cms') },
    { href: '/admin/blog', label: 'Blog', active: active === 'blog', show: can('cms') },
    { href: '/admin/tasks', label: 'Tasks', active: active === 'tasks', show: can('tasks') },
    { href: RAMS_URL, label: 'RAMS', active: false, show: can('rams') },
    {
      href: '/admin/enquiries',
      label: 'Enquiries',
      active: active === 'enquiries' || active === 'whatsapp',
      show: can('enquiries'),
    },
    { href: '/admin/crm', label: 'CRM', active: active === 'crm', show: can('crm') },
    { href: '/admin/assistant', label: 'Metis', active: active === 'assistant', show: can('crm') },
    { href: '/admin/subcontractors', label: 'Subcontractors', active: active === 'subcontractors', show: can('subcontractors') },
    { href: '/admin/analytics', label: 'Analytics', active: active === 'analytics', show: can('analytics') },
    { href: '/admin/analytics/heatmap', label: 'Heatmap', active: active === 'heatmap', show: can('analytics') },
    { href: '/admin/users', label: 'Users', active: active === 'users' || active === 'approvals', show: admin },
  ];
  const links = items.filter((i) => i.show);
  const tasksIsTab = !can('crm') && !can('enquiries') && can('tasks');
  const enquiriesIsTab = !can('crm') && can('enquiries');
  // Phone "More" sheet: what isn't a bottom tab, in groups. A new page is one entry here;
  // empty groups are left out.
  const groups: { id: string; title: string; items: MoreItem[] }[] = [
    {
      id: 'sales',
      title: 'Sales',
      items: [
        { href: '/admin/enquiries', label: 'Enquiries', icon: icons.enquiries, active: active === 'enquiries', show: can('enquiries') && !enquiriesIsTab },
        { href: '/admin/enquiries/smart-replies', label: 'Smart replies & chasers', short: 'Smart replies', icon: icons.replies, show: can('enquiries') },
        { href: '/admin/crm/reports', label: 'CRM reports', icon: icons.reports, show: can('crm') },
        { href: '/admin/crm/settings', label: 'CRM settings', icon: icons.settings, show: can('crm') },
        { href: '/admin/assistant', label: 'Metis', icon: icons.metis, active: active === 'assistant', show: can('crm') },
      ],
    },
    {
      id: 'jobs',
      title: 'Jobs & team',
      items: [
        { href: '/admin/tasks', label: 'Tasks', icon: icons.tasks, active: active === 'tasks', show: can('tasks') && !tasksIsTab },
        { href: '/admin/subcontractors', label: 'Subcontractors', icon: icons.subcontractors, active: active === 'subcontractors', show: can('subcontractors') },
        { href: '/api/sso/rams?next=%2Foperatives%3Fteam%3Dheliaxis', label: 'Our team', icon: icons.team, show: can('team') },
      ],
    },
    {
      id: 'website',
      title: 'Website',
      items: [
        { href: '/admin/cms', label: 'CMS', icon: icons.cms, show: can('cms') },
        { href: '/admin/blog', label: 'Blog', icon: icons.blog, active: active === 'blog', show: can('cms') },
        { href: '/admin/analytics', label: 'Analytics', icon: icons.analytics, active: active === 'analytics', show: can('analytics') },
        { href: '/admin/analytics/heatmap', label: 'Heatmap', icon: icons.heatmap, active: active === 'heatmap', show: can('analytics') },
      ],
    },
    {
      id: 'apps',
      title: 'Apps & admin',
      items: [
        { href: SOCIAL_URL, label: 'Social media studio', short: 'Social media', icon: icons.social, show: can('social') },
        { href: '/admin/users', label: 'Users', icon: icons.users, active: active === 'users' || active === 'approvals', show: admin },
        { href: '/admin/app', label: 'Get the app', icon: icons.app, active: active === 'app', show: true },
      ],
    },
  ];
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length > 0);
  const tiles = shown.flatMap((g) => g.items);
  // Two rows or fewer need no headings: one grid.
  const more = tiles.length > 6 ? shown : [{ id: 'all', title: '', items: tiles }];
  const moreActive = tiles.some((i) => i.active);
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
        backgroundColor: flush ? '#111' : brand.paper,
        backgroundImage: flush ? 'none' : 'url(/assets/heliaxis-card-fill-light.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'top right',
        backgroundRepeat: 'no-repeat',
        fontFamily: brand.body,
        color: brand.ink,
      }}
    >
      <header className="hx-header">
        <Link href="/admin" className="hx-header__logo">
          <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={140} height={32} style={{ width: '100%', height: 'auto' }} />
        </Link>
        <nav className="hx-nav">
          <span className="hx-nav__links">
            {links.map((l) => (
              <NavLink key={l.href} href={l.href} label={l.label} active={l.active} />
            ))}
          </span>
          <HeaderUser initials={initials} name={displayName} email={profile?.email ?? ''} signOut={signOut} />
        </nav>
      </header>

      <main
        className={flush ? 'admin-shell__main admin-shell__main--flush' : 'admin-shell__main'}
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
                maxWidth: wide ? 1200 : 1000,
                margin: '0 auto',
                // Padding lives in admin-shell.css so phones can tighten it and clear the tab bar.
              }
        }
      >
        {children}
      </main>
      {/* Phones: app-style tabs along the bottom instead of the wrapping menu. */}
      <nav className={flush ? 'hx-tabs hx-tabs--static' : 'hx-tabs'} aria-label="Sections">
        <TabLink href="/admin" label="Home" icon={icons.home} active={active === 'dashboard'} />
        {can('crm') ? (
          <TabLink href="/admin/crm" label="CRM" icon={icons.crm} active={active === 'crm'} />
        ) : can('enquiries') ? (
          <TabLink href="/admin/enquiries" label="Enquiries" icon={icons.enquiries} active={active === 'enquiries'} />
        ) : (
          can('tasks') && <TabLink href="/admin/tasks" label="Tasks" icon={icons.tasks} active={active === 'tasks'} />
        )}
        {can('enquiries') && (
          <TabLink
            href="/admin/enquiries/inbox"
            label="WhatsApp"
            icon={icons.whatsapp}
            active={active === 'whatsapp'}
            badge={waUnread}
          />
        )}
        {/* On site: RAMS one tap away. */}
        {can('rams') && <TabLink href={RAMS_URL} label="RAMS" icon={icons.rams} active={false} />}
        {tiles.length > 0 && (
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
                  className="hx-more__group"
                  role={g.title ? 'group' : undefined}
                  aria-labelledby={g.title ? `hx-more-${g.id}` : undefined}
                >
                  {g.title && (
                    <p id={`hx-more-${g.id}`} className="hx-more__title">
                      {g.title}
                    </p>
                  )}
                  <div className="hx-more__grid">
                    {g.items.map((i) => (
                      <MoreTile key={i.href} {...i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </MoreMenu>
        )}
      </nav>
      <AppRuntime />
    </div>
  );
}
