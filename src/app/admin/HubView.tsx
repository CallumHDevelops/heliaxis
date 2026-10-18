import Link from 'next/link';
import type { Portal, PortalKey } from '@/lib/portals';
import './hub.css';

const ICONS: Record<PortalKey | 'users' | 'app', string> = {
  app: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  cms: '<path d="M4 5h16v14H4z"/><path d="M4 9h16M8 13h5M8 16h8"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>',
  enquiries: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  crm: '<path d="M3 7h18v12H3z"/><path d="M8 7V5h8v2"/><path d="M3 12h18"/><path d="M11 12v2h2v-2"/>',
  analytics: '<path d="M5 19V10M10 19V5M15 19v-6M20 19v-9"/>',
  subcontractors: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="m15.5 10.5 2 2 3.5-4"/>',
  social: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>',
  team: '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3 19c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8"/><path d="M11 19c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8"/>',
  rams: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19c0-2.2-1.5-3.8-4-4.2"/>',
};

function Icon({ k }: { k: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[k] }}
    />
  );
}

export type HubPortal = Portal & { badge?: string };

function Card({
  href,
  icon,
  label,
  description,
  badge,
  external,
  variant,
  desktopOnly,
}: {
  href: string;
  icon: keyof typeof ICONS;
  label: string;
  description: string;
  badge?: string | null;
  external?: boolean;
  variant?: 'admin';
  /** Shown on phones: this one needs a bigger screen. */
  desktopOnly?: boolean;
}) {
  const body = (
    <>
      <span className="hub-card-top">
        <span className="hub-icon"><Icon k={icon} /></span>
        <span className="hub-title">{label}</span>
      </span>
      <span className="hub-desc">{description}</span>
      {desktopOnly && <span className="hub-desktop">Best on a tablet or computer</span>}
      <span className="hub-card-foot">
        {badge ? <span className="hub-badge">{badge}</span> : <span />}
        <span className="hub-open">{external ? 'Open app ↗' : 'Open →'}</span>
      </span>
    </>
  );
  const cls = `hub-card${variant ? ` is-${variant}` : ''}${badge ? ' has-badge' : ''}`;
  return external ? (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer">{body}</a>
  ) : (
    <Link className={cls} href={href}>{body}</Link>
  );
}

/** The /admin landing page: every portal this user can open, grouped, with "needs you" counts. */
export function HubView({
  firstName,
  portals,
  usersBadge,
  denied,
}: {
  firstName: string;
  portals: HubPortal[];
  /** undefined = not an admin (no Users card); null = admin with nothing pending. */
  usersBadge?: string | null;
  denied: boolean;
}) {
  const isAdmin = usersBadge !== undefined;
  const internal = portals.filter((p) => !p.external);
  const apps = portals.filter((p) => p.external);
  const attention = [
    ...portals.filter((p) => p.badge).map((p) => ({ href: p.href, label: `${p.label}: ${p.badge}` })),
    ...(usersBadge ? [{ href: '/admin/users', label: `Users: ${usersBadge}` }] : []),
  ];
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/London',
  });

  return (
    <div className="hub">
      <header className="hub-head">
        <div>
          <p className="hub-kicker">{today}</p>
          <h1>{firstName ? `Hi ${firstName}` : 'Dashboard'}</h1>
          <p className="hub-sub">Everything you have access to, in one place.</p>
        </div>
        <a className="hub-live" href="/" target="_blank" rel="noopener noreferrer">View live site ↗</a>
      </header>

      {denied && (
        <p className="hub-banner">You don&apos;t have access to that area. Ask an admin to add it to your account.</p>
      )}

      {attention.length > 0 && (
        <section className="hub-attn" aria-label="Needs your attention">
          <span className="hub-attn-label">Needs you</span>
          {attention.map((a) => (
            <Link key={a.href} href={a.href} className="hub-attn-item">{a.label} →</Link>
          ))}
        </section>
      )}

      {portals.length === 0 && !isAdmin ? (
        <p className="hub-banner">No portals have been added to your account yet. Ask an admin to give you access.</p>
      ) : (
        <>
          {internal.length > 0 && (
            <section className="hub-section">
              <h2 className="hub-h2">Workspace</h2>
              <div className="hub-grid">
                {internal.map((p) => (
                  <Card
                    key={p.key}
                    href={p.href}
                    icon={p.key}
                    label={p.label}
                    description={p.description}
                    badge={p.badge}
                    desktopOnly={p.key === 'cms'}
                  />
                ))}
              </div>
            </section>
          )}

          {apps.length > 0 && (
            <section className="hub-section">
              <h2 className="hub-h2">Apps</h2>
              <div className="hub-grid">
                {apps.map((p) => (
                  <Card key={p.key} href={p.href} icon={p.key} label={p.label} description={p.description} badge={p.badge} external />
                ))}
              </div>
            </section>
          )}

          <section className="hub-section">
            <h2 className="hub-h2">On your phone</h2>
            <div className="hub-grid">
              <Card
                href="/admin/app"
                icon="app"
                label="Android app"
                description="Install Heliaxis on your phone or tablet. Tasks work offline."
              />
            </div>
          </section>

          {isAdmin && (
            <section className="hub-section">
              <h2 className="hub-h2">Admin</h2>
              <div className="hub-grid">
                <Card
                  href="/admin/users"
                  icon="users"
                  label="Users & access"
                  description="Approve sign-ups and choose which portals each person can open."
                  badge={usersBadge}
                  variant="admin"
                />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
