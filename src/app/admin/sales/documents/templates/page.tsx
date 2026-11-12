import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { TemplateLibrary } from './TemplateLibrary';

export const dynamic = 'force-dynamic';

/** Sales › Documents › New document › From template: the library of ready-made documents. */
export default async function TemplatesPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  return (
    <AdminShell active="sales" fluid>
      <TemplateLibrary admin={session.profile.role === 'admin'} />
    </AdminShell>
  );
}
