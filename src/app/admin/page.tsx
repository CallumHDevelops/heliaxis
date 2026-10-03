import type { Metadata } from 'next';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { PORTALS, portalsFor, type PortalKey } from '@/lib/portals';
import { HubView } from './HubView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard · Heliaxis',
  robots: { index: false, follow: false },
};

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
    <AdminShell active="dashboard" isAdmin={isAdmin} wide>
      <HubView
        firstName={firstName}
        portals={portals.map((p) => ({ ...p, badge: counts[p.key] }))}
        usersBadge={isAdmin ? (counts.users ?? null) : undefined}
        denied={!!denied}
      />
    </AdminShell>
  );
}
