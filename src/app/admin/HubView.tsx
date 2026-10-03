import Link from 'next/link';
import type { Portal, PortalKey } from '@/lib/portals';
import './hub.css';

const ICONS: Record<PortalKey | 'users', string> = {
  cms: '<path d="M4 5h16v14H4z"/><path d="M4 9h16M8 13h5M8 16h8"/>',
  enquiries: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  analytics: '<path d="M5 19V10M10 19V5M15 19v-6M20 19v-9"/>',
  subcontractors: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="m15.5 10.5 2 2 3.5-4"/>',
  social: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>',
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
}: {
  href: string;
  icon: keyof typeof ICONS;
  label: string;
  description: string;
  badge?: string | null;
  external?: boolean;
  variant?: 'admin';
}) {
  const body = (
    <>
      <span className="hub-card-top">
        <span className="hub-icon"><Icon k={icon} /></span>
        <span className="hub-title">{label}</span>
      </span>
      <span className="hub-desc">{description}</span>
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
                  <Card key={p.key} href={p.href} icon={p.key} label={p.label} description={p.description} badge={p.badge} />
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
