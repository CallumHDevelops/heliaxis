import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { EicList } from './EicList';

export const dynamic = 'force-dynamic';

/** Operations › EIC certificates. */
export default async function EicPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  return (
    <AdminShell active="eic" fluid>
      <EicList />
    </AdminShell>
  );
}
