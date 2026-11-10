/** Scaffolding and savings estimator. */
import type { Metadata } from 'next';
import { AdminShell } from '@/components/prospectpv/admin/AdminShell';
import { requireStaff } from '@/lib/prospectpv/server/auth';
import { loadPackages, loadSettings } from '@/lib/prospectpv/server/data';
import { EstimatorScreen } from '../_screens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Estimator · ProspectPV', robots: { index: false, follow: false } };

export default async function EstimatorPage() {
  const { db, role } = await requireStaff();
  const [packages, settings] = await Promise.all([loadPackages(db), loadSettings(db)]);
  return (
    <AdminShell active="estimator">
      <EstimatorScreen packages={packages} settings={settings} canEdit={role === 'admin'} />
    </AdminShell>
  );
}
