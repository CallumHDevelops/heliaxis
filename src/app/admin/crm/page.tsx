import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { CrmBoard } from './CrmBoard';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  const { user } = await getSessionProfile();
  return (
    <AdminShell active="crm" wide>
      <CrmBoard me={user?.id ?? ''} />
    </AdminShell>
  );
}
