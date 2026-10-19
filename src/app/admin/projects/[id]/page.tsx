import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { ProjectView } from '../../crm/[id]/ProjectView';

export const dynamic = 'force-dynamic';

/** A job opened from Projects: the same record page as the CRM's (spec D1). */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await getSessionProfile();
  return (
    <AdminShell active="crm" fluid>
      <ProjectView id={id} isAdmin={profile?.role === 'admin'} />
    </AdminShell>
  );
}
