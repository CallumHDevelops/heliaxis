import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { readBuilds } from '@/lib/builds-server';
import { BuildBoard } from './BuildBoard';
import './builds.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Build tracker · Heliaxis', robots: { index: false, follow: false } };

/**
 * Team › Build tracker: every piece of work being built on HAP and the website, with where it stands and the next step,
 * so work can be switched between and picked up again. Admins only.
 */
export default async function BuildsPage() {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved') redirect('/login?next=%2Fadmin%2Fbuilds');
  if (profile.role !== 'admin') redirect('/admin?denied=1');
  const items = await readBuilds();
  return (
    <AdminShell active="builds" fluid>
      <div className="bt-page">
        <header className="bt-head">
          <div>
            <h1>Build tracker</h1>
            <p>Everything being built, where each piece stands and the next step, so you can switch between them and pick any one up again.</p>
          </div>
        </header>
        <BuildBoard initial={items} />
      </div>
    </AdminShell>
  );
}
