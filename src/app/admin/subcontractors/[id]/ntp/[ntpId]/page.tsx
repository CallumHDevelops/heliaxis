import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ntpHash } from '@/lib/subcontractors/ntp';
import { ntpIntact } from '@/lib/subcontractors/hashing';
import type { NtpRow } from '@/lib/subcontractors/types';
import { NtpDocument } from '@/components/subcontractors/NtpDocument';
import { PrintButton } from '@/components/subcontractors/PrintButton';
import '../../../subcontractors.css';

export const dynamic = 'force-dynamic';

export default async function AdminNtpPage({ params }: { params: Promise<{ id: string; ntpId: string }> }) {
  const { id, ntpId } = await params;
  const { data } = await createAdminClient()
    .from('subcontractor_ntp_agreements')
    .select('*')
    .eq('id', ntpId)
    .eq('subcontractor_id', id)
    .maybeSingle();
  const ntp = data as NtpRow | null;
  if (!ntp) notFound();
  return (
    <div className="sc-print">
      <div className="sc-row-between sc-noprint">
        <Link className="sc-back" href={`/admin/subcontractors/${id}`}>← Back</Link>
        <PrintButton />
      </div>
      <NtpDocument snapshot={ntp.snapshot} ntp={ntp} contentHash={ntpIntact(ntp.snapshot, ntp.content_hash) ? ntp.content_hash : ntpHash(ntp.snapshot)} />
    </div>
  );
}
