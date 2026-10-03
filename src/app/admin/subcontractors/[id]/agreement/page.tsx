import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { agreementHash, buildSnapshot } from '@/lib/subcontractors/server';
import { SUB_COLUMNS, type AgreementRow, type SubcontractorRow } from '@/lib/subcontractors/types';
import { AgreementDocument } from '@/components/subcontractors/AgreementDocument';
import { PrintButton } from '@/components/subcontractors/PrintButton';
import '../../subcontractors.css';

export const dynamic = 'force-dynamic';

export default async function AdminAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: sub }, { data: agr }] = await Promise.all([
    admin.from('subcontractors').select(SUB_COLUMNS).eq('id', id).maybeSingle(),
    admin
      .from('subcontractor_agreements')
      .select('*')
      .eq('subcontractor_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!sub) notFound();
  const agreement = agr as AgreementRow | null;
  const snapshot = agreement?.snapshot ?? buildSnapshot(sub as SubcontractorRow);

  return (
    <div className="sc-print">
      <div className="sc-row-between sc-noprint">
        <a className="sc-back" href={`/admin/subcontractors/${id}`}>← Back</a>
        <PrintButton />
      </div>
      {!agreement && <p className="sc-banner is-warn sc-noprint">Preview — not signed yet.</p>}
      <AgreementDocument snapshot={snapshot} agreement={agreement} contentHash={agreementHash(snapshot)} />
    </div>
  );
}
