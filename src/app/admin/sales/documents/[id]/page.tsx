import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { isUuid } from '@/lib/crm/server';
import { DocumentEditor } from './DocumentEditor';

export const dynamic = 'force-dynamic';

/** One document: assign it to a customer, build it from blocks, download the PDF or Word file. */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <AdminShell active="sales" fluid>
      <DocumentEditor id={id} admin={session.profile.role === 'admin'} />
    </AdminShell>
  );
}
