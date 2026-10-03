import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { PORTALS, portalsFor, type PortalKey } from '@/lib/portals';
import './hub.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard · Heliaxis',
  robots: { index: false, follow: false },
};

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
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[k] }}
    />
  );
}

/** Small "needs you" counts per portal. Each is best-effort — a failing query just hides the badge. */
async function badges(keys: PortalKey[], isAdmin: boolean) {
  const admin = createAdminClient();
  const out: Partial<Record<PortalKey | 'users', string>> = {};
  const count = async (q: PromiseLike<{ count: number | null }>) => {
    try {
      return (await q).count ?? 0;
    } catch {
      return 0;
    }
  };
  await Promise.all([
    keys.includes('enquiries') &&
      count(admin.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new')).then((n) => {
        if (n) out.enquiries = `${n} new`;
      }),
    keys.includes('subcontractors') &&
      Promise.all([
        count(admin.from('subcontractors').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_countersign')),
        count(admin.from('subcontractor_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      ]).then(([sign, docs]) => {
        const parts = [sign && `${sign} to countersign`, docs && `${docs} docs to review`].filter(Boolean);
        if (parts.length) out.subcontractors = parts.join(' · ');
      }),
    isAdmin &&
      count(admin.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).then((n) => {
        if (n) out.users = `${n} awaiting approval`;
      }),
  ]);
  return out;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const { profile } = await getSessionProfile();
  const isAdmin = profile?.role === 'admin';
  const keys = portalsFor(profile);
  const portals = PORTALS.filter((p) => keys.includes(p.key));
  const counts = await badges(keys, isAdmin);
  const firstName = (profile?.full_name || profile?.email || '').split(/[\s@]/)[0];

  return (
    <AdminShell active="dashboard" isAdmin={isAdmin}>
      <div className="hub">
        <header className="hub-head">
          <p className="hub-kicker">Heliaxis workspace</p>
          <h1>{firstName ? `Hi ${firstName}` : 'Dashboard'}</h1>
          <p>Everything you have access to, in one place.</p>
        </header>

        {denied && (
          <p className="hub-banner">You don&apos;t have access to that area. Ask an admin to add it to your account.</p>
        )}

        {portals.length === 0 && !isAdmin ? (
          <p className="hub-banner">No portals have been added to your account yet. Ask an admin to give you access.</p>
        ) : (
          <div className="hub-grid">
            {portals.map((p) => (
              <a
                key={p.key}
                className="hub-card"
                href={p.href}
                {...(p.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className="hub-icon"><Icon k={p.key} /></span>
                <span className="hub-title">
                  {p.label}
                  {p.external && <span className="hub-ext" aria-label="opens in a new tab">↗</span>}
                </span>
                <span className="hub-desc">{p.description}</span>
                {counts[p.key] && <span className="hub-badge">{counts[p.key]}</span>}
              </a>
            ))}
            {isAdmin && (
              <Link className="hub-card is-admin" href="/admin/users">
                <span className="hub-icon"><Icon k="users" /></span>
                <span className="hub-title">Users &amp; access</span>
                <span className="hub-desc">Approve sign-ups and choose which portals each person can open.</span>
                {counts.users && <span className="hub-badge">{counts.users}</span>}
              </Link>
            )}
          </div>
        )}

        <p className="hub-foot">
          <a href="/" target="_blank" rel="noopener noreferrer">View live site ↗</a>
        </p>
      </div>
    </AdminShell>
  );
}
