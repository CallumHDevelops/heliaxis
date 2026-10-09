import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { agreementHash, buildSnapshot } from '@/lib/subcontractors/server';
import { getPortalSub } from '@/lib/subcontractors/session';
import type { AgreementRow, AssignmentRow, DocumentRow, NtpRow, OperativeRow } from '@/lib/subcontractors/types';
import { NtpDocument } from '@/components/subcontractors/NtpDocument';
import { signsByLink } from '@/lib/subcontractors/ntp';
import { AgreementDocument } from '@/components/subcontractors/AgreementDocument';
import { PortalApp } from './PortalApp';

export const dynamic = 'force-dynamic';

export default async function PortalPage() {
  const sub = await getPortalSub();
  if (!sub) redirect('/portal');

  const admin = createAdminClient();
  const [{ data: agr }, { data: docs }, { data: ops }, { data: jobs }, { data: ntpData }] = await Promise.all([
    admin
      .from('subcontractor_agreements')
      .select('*')
      .eq('subcontractor_id', sub.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('subcontractor_documents').select('*').eq('subcontractor_id', sub.id).order('uploaded_at', { ascending: false }),
    admin.from('subcontractor_operatives').select('*').eq('subcontractor_id', sub.id).order('full_name'),
    admin
      .from('subcontractor_assignments')
      .select('*')
      .eq('subcontractor_id', sub.id)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true, nullsFirst: false }),
    admin
      .from('subcontractor_ntp_agreements')
      .select('*')
      .eq('subcontractor_id', sub.id)
      .not('status', 'in', '(cancelled,superseded)')
      .order('created_at', { ascending: false }),
  ]);
  const ntps = (ntpData ?? []) as NtpRow[];
  const agreement = agr as AgreementRow | null;

  // Unsigned: show the live text built from their current details (and its hash, which
  // the sign endpoint re-checks). Signed: show the frozen snapshot they actually signed.
  const snapshot = agreement?.snapshot ?? buildSnapshot(sub);
  const hash = agreementHash(snapshot);

  return (
    <PortalApp
      sub={{
        ref: sub.ref,
        companyName: sub.company_name,
        contactName: sub.contact_name,
        email: sub.email,
        phone: sub.phone,
        trade: sub.trade,
        status: sub.status,
        details: sub.details || {},
        docsSubmittedAt: sub.docs_submitted_at,
      }}
      agreement={
        agreement
          ? {
              subName: agreement.sub_name,
              subSignedAt: agreement.sub_signed_at,
              hlxName: agreement.hlx_name,
              hlxSignedAt: agreement.hlx_signed_at,
            }
          : null
      }
      documents={((docs ?? []) as DocumentRow[]).map((d) => ({ ...d, storage_path: undefined }))}
      operatives={(ops ?? []) as OperativeRow[]}
      jobs={(jobs ?? []) as AssignmentRow[]}
      ntps={ntps.map((n) => ({
        id: n.id,
        ref: n.ref,
        status: n.status,
        ntpName: n.ntp_name,
        operativeId: n.operative_id,
        signsByLink: signsByLink(n, sub),
        technologies: n.technologies,
        validFrom: n.valid_from,
        expiresOn: n.expires_on,
        hash: n.content_hash,
      }))}
      ntpViews={Object.fromEntries(
        ntps
          .filter((n) => n.status === 'awaiting_signature' && !signsByLink(n, sub))
          .map((n) => [n.id, <NtpDocument key={n.id} snapshot={n.snapshot} showAudit={false} />])
      )}
      hash={hash}
      agreementView={<AgreementDocument snapshot={snapshot} agreement={agreement} showAudit={false} />}
    />
  );
}
