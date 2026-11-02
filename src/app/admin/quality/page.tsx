import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requireApproved } from '@/lib/auth';
import { loadRecords, ukToday } from '@/lib/qms/server';
import { RECORD_KINDS, type RecordKind } from '@/lib/qms/types';
import { schemaReady } from '@/lib/schema-ready';
import { RecordsPage } from './RecordsPage';

export const dynamic = 'force-dynamic';

/** Operations → Quality records: open to every approved user (src/lib/portals.ts › QUALITY_PATH). ?kind=complaint opens that list. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireApproved();
  if (!session) redirect('/admin?denied=1');
  const [sp, schema] = await Promise.all([searchParams, schemaReady()]);
  const kind = RECORD_KINDS.find((k) => k.key === sp.kind)?.key ?? ('complaint' as RecordKind);
  const records = schema.qms ? await loadRecords().catch(() => []) : [];
  return (
    <AdminShell active="quality" fluid>
      <RecordsPage ready={schema.qms} initial={records} admin={session.profile.role === 'admin'} today={ukToday()} initialKind={kind} />
    </AdminShell>
  );
}
