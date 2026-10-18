import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { CrmSettingsView } from './CrmSettingsView';

export const dynamic = 'force-dynamic';

export default async function CrmSettingsPage() {
  const { profile } = await getSessionProfile();
  return (
    <AdminShell active="crm">
      <CrmSettingsView isAdmin={profile?.role === 'admin'} />
    </AdminShell>
  );
}
