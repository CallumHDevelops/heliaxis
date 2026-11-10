import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { DocumentsList } from './DocumentsList';

export const dynamic = 'force-dynamic';

/** Sales › Documents: tenders and other documents written in the app, newest edit first, and + New document. */
export default async function DocumentsPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  return (
    <AdminShell active="sales" fluid>
      <DocumentsList />
    </AdminShell>
  );
}
