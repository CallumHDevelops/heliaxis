import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { ProjectView } from './ProjectView';

export const dynamic = 'force-dynamic';

export default async function CrmProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await getSessionProfile();
  return (
    <AdminShell active="crm" fluid>
      <ProjectView id={id} isAdmin={profile?.role === 'admin'} />
    </AdminShell>
  );
}
