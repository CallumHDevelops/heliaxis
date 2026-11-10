/** Brand images and all settings. */
import type { Metadata } from 'next';
import { AdminShell } from '@/components/prospectpv/admin/AdminShell';
import { requireStaff } from '@/lib/prospectpv/server/auth';
import { assetUrls, loadAssets, loadRawSettings } from '@/lib/prospectpv/server/data';
import { SettingsScreen } from '../_screens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings · ProspectPV', robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const { db, role } = await requireStaff();
  const [raw, assets] = await Promise.all([loadRawSettings(db), loadAssets(db)]);
  return (
    <AdminShell active="settings">
      <SettingsScreen rawSettings={raw} assetUrls={assetUrls(assets) as Record<string, string | null>} canEdit={role === 'admin'} />
    </AdminShell>
  );
}
