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
  | 'app';

const RAMS_URL = 'https://rams.heliaxis.co.uk';

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
  return (
    <Link href={href} className={active ? 'hx-tab is-active' : 'hx-tab'} aria-current={active ? 'page' : undefined}>
      <span className="hx-tab__icon">
        {icon}
        {badge ? <span className="hx-tab__badge">{badge > 9 ? '9+' : badge}</span> : null}
      </span>
      <span className="hx-tab__label">{label}</span>
    </Link>
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

  // Desktop menu (all of it) and the phone "More" sheet (what isn't a bottom tab).
  type Item = { href: string; label: string; active: boolean; tab?: boolean; show: boolean };
  const items: Item[] = [
    { href: '/admin', label: 'Dashboard', active: active === 'dashboard', tab: true, show: true },
    { href: '/admin/cms', label: 'CMS', active: false, show: can('cms') },
    { href: '/admin/blog', label: 'Blog', active: active === 'blog', show: can('cms') },
    { href: '/admin/tasks', label: 'Tasks', active: active === 'tasks', tab: true, show: can('tasks') },
    { href: RAMS_URL, label: 'RAMS', active: false, tab: true, show: can('rams') },
    {
      href: '/admin/enquiries',
      label: 'Enquiries',
      active: active === 'enquiries' || active === 'whatsapp',
      tab: true,
      show: can('enquiries'),
    },
    { href: '/admin/crm', label: 'CRM', active: active === 'crm', tab: true, show: can('crm') },
    { href: '/admin/subcontractors', label: 'Subcontractors', active: active === 'subcontractors', show: can('subcontractors') },
    { href: '/admin/analytics', label: 'Analytics', active: active === 'analytics', show: can('analytics') },
    { href: '/admin/analytics/heatmap', label: 'Heatmap', active: active === 'heatmap', show: can('analytics') },
    { href: '/admin/users', label: 'Users', active: active === 'users' || active === 'approvals', show: admin },
  ];
  const links = items.filter((i) => i.show);
  const tasksIsTab = !can('crm') && !can('enquiries') && can('tasks');
  const enquiriesIsTab = !can('crm') && can('enquiries');
  const more = [
    ...(can('enquiries') && !enquiriesIsTab ? [{ href: '/admin/enquiries', label: 'Enquiries', active: active === 'enquiries' }] : []),
    ...(can('tasks') && !tasksIsTab ? [{ href: '/admin/tasks', label: 'Tasks', active: active === 'tasks' }] : []),
    ...links.filter((i) => !i.tab),
    ...(can('enquiries') ? [{ href: '/admin/enquiries/smart-replies', label: 'Smart replies & chasers', active: false }] : []),
    ...(can('crm')
      ? [
          { href: '/admin/crm/reports', label: 'CRM reports', active: false },
          { href: '/admin/crm/settings', label: 'CRM settings', active: false },
        ]
      : []),
    ...(can('social') ? [{ href: 'https://social.heliaxis.co.uk', label: 'Social media studio', active: false }] : []),
    ...(can('team') ? [{ href: 'https://rams.heliaxis.co.uk/operatives?team=heliaxis', label: 'Our team', active: false }] : []),
    { href: '/admin/app', label: 'Get the app', active: active === 'app' },
  ];
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
        {more.length > 0 && (
          <details className="hx-more">
            <summary className={more.some((l) => l.active) ? 'hx-tab is-active' : 'hx-tab'}>
              <span className="hx-tab__icon">{icons.more}</span>
              <span className="hx-tab__label">More</span>
            </summary>
            <div className="hx-more__sheet">
              {more.map((l) => (
                <a key={l.href} href={l.href} className={l.active ? 'hx-more__link is-active' : 'hx-more__link'}>
                  {l.label}
                </a>
              ))}
            </div>
          </details>
        )}
      </nav>
      <AppRuntime />
    </div>
  );
}
