import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ntpHash } from '@/lib/subcontractors/ntp';
import { getPortalSub } from '@/lib/subcontractors/session';
import type { NtpRow } from '@/lib/subcontractors/types';
import { NtpDocument } from '@/components/subcontractors/NtpDocument';
import { PrintButton } from '@/components/subcontractors/PrintButton';

export const dynamic = 'force-dynamic';

export default async function PortalNtpPage({ params }: { params: Promise<{ id: string }> }) {
  const sub = await getPortalSub();
  if (!sub) redirect('/portal');
  const { id } = await params;
  const { data } = await createAdminClient()
    .from('subcontractor_ntp_agreements')
    .select('*')
    .eq('id', id)
    .eq('subcontractor_id', sub.id)
    .maybeSingle();
  const ntp = data as NtpRow | null;
  if (!ntp) notFound();
  return (
    <div className="pt-card pt-printable">
      <div className="pt-row-between pt-noprint">
        <Link className="pt-link" href="/portal/app">← Back to portal</Link>
        <PrintButton />
      </div>
      <NtpDocument snapshot={ntp.snapshot} ntp={ntp} contentHash={ntpHash(ntp.snapshot)} />
    </div>
  );
}
