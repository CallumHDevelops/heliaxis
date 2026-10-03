import { createAdminClient } from '@/lib/supabase/admin';
import { agreementHash, buildSnapshot, findByToken } from '@/lib/subcontractors/server';
import type { AgreementRow } from '@/lib/subcontractors/types';
import { AgreementDocument } from '@/components/subcontractors/AgreementDocument';
import { PrintButton } from '@/components/subcontractors/PrintButton';
import { InvalidLink } from '../../InvalidLink';

export const dynamic = 'force-dynamic';

export default async function PortalAgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sub = await findByToken(token);
  if (!sub) return <InvalidLink />;

  const { data } = await createAdminClient()
    .from('subcontractor_agreements')
    .select('*')
    .eq('subcontractor_id', sub.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const agreement = data as AgreementRow | null;
  const snapshot = agreement?.snapshot ?? buildSnapshot(sub);

  return (
    <div className="pt-card pt-printable">
      <div className="pt-row-between pt-noprint">
        <a className="pt-link" href={`/portal/${token}`}>← Back to portal</a>
        <PrintButton />
      </div>
      <AgreementDocument snapshot={snapshot} agreement={agreement} contentHash={agreementHash(snapshot)} />
    </div>
  );
}
