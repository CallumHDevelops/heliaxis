import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { agreementHash, buildSnapshot } from '@/lib/subcontractors/server';
import { agreementIntact } from '@/lib/subcontractors/hashing';
import { getPortalSub } from '@/lib/subcontractors/session';
import type { AgreementRow } from '@/lib/subcontractors/types';
import { AgreementDocument } from '@/components/subcontractors/AgreementDocument';
import { PrintButton } from '@/components/subcontractors/PrintButton';

export const dynamic = 'force-dynamic';

export default async function PortalAgreementPage() {
  const sub = await getPortalSub();
  if (!sub) redirect('/portal');

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
        <Link className="pt-link" href="/portal/app">← Back to portal</Link>
        <PrintButton />
      </div>
      <AgreementDocument snapshot={snapshot} agreement={agreement} contentHash={agreement && agreementIntact(snapshot, agreement.content_hash) ? agreement.content_hash : agreementHash(snapshot)} />
    </div>
  );
}
