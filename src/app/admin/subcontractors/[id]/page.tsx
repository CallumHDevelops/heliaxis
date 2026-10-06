import { notFound } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { agreementHash } from '@/lib/subcontractors/server';
import { ramsAppUrl, ramsConfigured } from '@/lib/subcontractors/rams-sync';
import {
  SUB_COLUMNS,
  type AgreementRow,
  type DocumentRow,
  type EventRow,
  type SubcontractorRow,
} from '@/lib/subcontractors/types';
import { SubcontractorDetail } from './SubcontractorDetail';

export const dynamic = 'force-dynamic';
// Server actions on this page may copy several certificates to RAMS.
export const maxDuration = 60;

export default async function SubcontractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await getSessionProfile();
  const admin = createAdminClient();
  const [{ data: sub }, { data: agr }, { data: docs }, { data: events }] = await Promise.all([
    admin.from('subcontractors').select(SUB_COLUMNS).eq('id', id).maybeSingle(),
    admin
      .from('subcontractor_agreements')
      .select('*')
      .eq('subcontractor_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('subcontractor_documents').select('*').eq('subcontractor_id', id).order('uploaded_at', { ascending: false }),
    admin
      .from('subcontractor_events')
      .select('id, actor, type, detail, ip, created_at')
      .eq('subcontractor_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (!sub) notFound();
  // Separate query: these columns only exist once supabase/rams-sync.sql has run.
  const { data: ramsRow, error: ramsErr } = await admin
    .from('subcontractors')
    .select('rams_id, rams_synced_at, rams_sync_error')
    .eq('id', id)
    .maybeSingle();
  const agreement = agr as AgreementRow | null;

  return (
    <AdminShell active="subcontractors" isAdmin={profile?.role === 'admin'}>
      <SubcontractorDetail
        sub={sub as SubcontractorRow}
        agreement={
          agreement
            ? {
                subName: agreement.sub_name,
                subTitle: agreement.sub_title,
                subSignedAt: agreement.sub_signed_at,
                subIp: agreement.sub_ip,
                hlxName: agreement.hlx_name,
                hlxSignedAt: agreement.hlx_signed_at,
                hlxSignedBy: agreement.hlx_signed_by,
                version: agreement.version,
                intact: agreementHash(agreement.snapshot) === agreement.content_hash,
              }
            : null
        }
        documents={(docs ?? []) as DocumentRow[]}
        events={(events ?? []) as EventRow[]}
        adminName={profile?.full_name || ''}
        rams={{
          configured: ramsConfigured(),
          appUrl: ramsAppUrl(),
          ramsId: ramsRow?.rams_id ?? null,
          syncedAt: ramsRow?.rams_synced_at ?? null,
          error: ramsRow?.rams_sync_error ?? null,
          setUp: !ramsErr,
        }}
      />
    </AdminShell>
  );
}
