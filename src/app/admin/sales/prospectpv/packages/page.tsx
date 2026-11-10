/** Packages and extras, with prices. */
import type { Metadata } from 'next';
import { AdminShell } from '@/components/prospectpv/admin/AdminShell';
import { requireStaff } from '@/lib/prospectpv/server/auth';
import { loadExtras, loadPackages, publicAssetUrl } from '@/lib/prospectpv/server/data';
import { PackagesScreen } from '../_screens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Packages · ProspectPV', robots: { index: false, follow: false } };

export default async function PackagesPage() {
  const { db, role } = await requireStaff();
  const [packages, extras] = await Promise.all([loadPackages(db), loadExtras(db)]);
  return (
    <AdminShell active="packages">
      <PackagesScreen
        packages={packages}
        extras={extras}
        imageUrls={Object.fromEntries(packages.map((p) => [p.id, p.image_path ? publicAssetUrl(p.image_path) : null]))}
        canEdit={role === 'admin'}
      />
    </AdminShell>
  );
}
