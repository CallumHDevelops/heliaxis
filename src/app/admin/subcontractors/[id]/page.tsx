import { notFound } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { agreementIntact } from '@/lib/subcontractors/hashing';
import { chasesFor } from '@/lib/subcontractors/reminders';
import {
  type AgreementRow,
  type AssignmentRow,
  type OperativeRow,
  type PullRow,
  type NtpRow,
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
  const admin = createAdminClient();
  // Everything in one round trip batch (each query is independent).
  const [{ profile }, { data: sub }, { data: agr }, { data: docs }, { data: events }, { data: team }, { data: jobs }, { data: pulls }, { data: ntps }] =
    await Promise.all([
      getSessionProfile(),
      // '*' so reminders_paused comes along when supabase/reminders.sql has run (and nothing breaks if not).
      admin.from('subcontractors').select('*').eq('id', id).maybeSingle(),
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
      admin.from('subcontractor_operatives').select('*').eq('subcontractor_id', id).order('full_name'),
      admin.from('subcontractor_assignments').select('*').eq('subcontractor_id', id).order('created_at', { ascending: false }),
      admin
        .from('subcontractor_document_pulls')
        .select('*')
        .eq('subcontractor_id', id)
        .order('pulled_at', { ascending: false })
        .limit(200),
      admin.from('subcontractor_ntp_agreements').select('*').eq('subcontractor_id', id).order('created_at', { ascending: false }),
    ]);
  if (!sub) notFound();
  const agreement = agr as AgreementRow | null;
  const ntpRows = (ntps ?? []) as NtpRow[];
  const subRow = sub as SubcontractorRow & { reminders_paused?: boolean };

  // What the firm would be chased for today — worked out from the data already loaded.
  let outstanding: { kind: string; text: string; urgent: boolean }[] = [];
  // Terminated firms are never chased (same rule as the daily job's loadFirms).
  if (subRow.status !== 'terminated') try {
    outstanding = chasesFor({
      sub: subRow,
      framework: agreement ? { sub_signed_at: agreement.sub_signed_at, hlx_signed_at: agreement.hlx_signed_at } : null,
      docs: (docs ?? []) as DocumentRow[],
      ops: (team ?? []) as OperativeRow[],
      jobs: ((jobs ?? []) as AssignmentRow[]).filter((j) => j.status === 'awaiting_crew'),
      ntps: ntpRows.filter((n) => n.status === 'awaiting_signature' || n.status === 'awaiting_countersign'),
      activeNtpIds: new Set(ntpRows.filter((n) => n.status === 'active').map((n) => n.id)),
    }).firm.map((c) => ({ kind: c.kind, text: c.text, urgent: !!c.urgent }));
  } catch {
    outstanding = [];
  }

  return (
    <AdminShell active="subcontractors" isAdmin={profile?.role === 'admin'}>
      <SubcontractorDetail
        sub={subRow}
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
                intact: agreementIntact(agreement.snapshot, agreement.content_hash),
              }
            : null
        }
        documents={(docs ?? []) as DocumentRow[]}
        events={(events ?? []) as EventRow[]}
        adminName={profile?.full_name || ''}
        team={(team ?? []) as OperativeRow[]}
        jobs={(jobs ?? []) as AssignmentRow[]}
        pulls={(pulls ?? []) as PullRow[]}
        ntps={(ntps ?? []) as NtpRow[]}
        reminders={{ paused: !!subRow.reminders_paused, outstanding }}
      />
    </AdminShell>
  );
}
