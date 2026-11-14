import { notFound, redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { isUuid } from '@/lib/crm/server';
import { EicEditor } from './EicEditor';

export const dynamic = 'force-dynamic';

/** One EIC certificate: its questions, boards and circuits, signatures and PDF. */
export default async function EicCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return (
    <AdminShell active="eic" fluid>
      <EicEditor id={id} admin={session.profile.role === 'admin'} />
    </AdminShell>
  );
}
