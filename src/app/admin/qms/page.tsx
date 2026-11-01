import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { loadOverview, ukToday } from '@/lib/qms/server';
import { schemaReady } from '@/lib/schema-ready';
import { QmsPage } from './QmsPage';

export const dynamic = 'force-dynamic';

/**
 * Operations → QMS: the controlled-document registers (internal documents, procedures, forms, external documents),
 * each document's checks, comments and approval, and the QMS records. ?doc=P03 opens a document.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const [sp, schema] = await Promise.all([searchParams, schemaReady()]);
  const initial = schema.qms ? await loadOverview().catch(() => ({ rows: [], records: [], today: ukToday() })) : { rows: [], records: [], today: ukToday() };
  return (
    <AdminShell active="qms" fluid>
      <QmsPage ready={schema.qms} initial={initial} admin={session.profile.role === 'admin'} openRef={typeof sp.doc === 'string' ? sp.doc.slice(0, 20) : null} />
    </AdminShell>
  );
}
