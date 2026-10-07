import { notFound } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { agreementHash } from '@/lib/subcontractors/server';
import {
  SUB_COLUMNS,
  type AgreementRow,
  type AssignmentRow,
  type OperativeRow,
  type PullRow,
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
  // Team, jobs and the RAMS pull ledger (tables from supabase/portal-v2.sql).
  const [{ data: team }, { data: jobs }, { data: pulls }] = await Promise.all([
    admin.from('subcontractor_operatives').select('*').eq('subcontractor_id', id).order('full_name'),
    admin.from('subcontractor_assignments').select('*').eq('subcontractor_id', id).order('created_at', { ascending: false }),
    admin
      .from('subcontractor_document_pulls')
      .select('*')
      .eq('subcontractor_id', id)
      .order('pulled_at', { ascending: false })
      .limit(200),
  ]);
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
        team={(team ?? []) as OperativeRow[]}
        jobs={(jobs ?? []) as AssignmentRow[]}
        pulls={(pulls ?? []) as PullRow[]}
      />
    </AdminShell>
  );
}
