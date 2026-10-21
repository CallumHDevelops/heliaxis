import { createAdminClient } from '@/lib/supabase/admin';
import { findNtpBySigningToken } from '@/lib/subcontractors/ntp';
import { NtpDocument } from '@/components/subcontractors/NtpDocument';
import { NtpSignForm } from './NtpSignForm';

export const dynamic = 'force-dynamic';

/** Opened from the NTP's personal email link. */
export default async function NtpSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ntp = await findNtpBySigningToken(token);
  if (!ntp) {
    return (
      <div className="pt-card pt-narrow">
        <h1>This link has expired</h1>
        <p>
          Signing links work for 14 days and only once, and each new email from us replaces the link in earlier ones — if
          you have a newer email from Heliaxis, use the link in that one. Otherwise ask us to send a new link:{' '}
          <a href="mailto:hello@heliaxis.co.uk">hello@heliaxis.co.uk</a> / <a href="tel:01633965205">01633 965205</a>.
        </p>
      </div>
    );
  }
  const { data: sub } = await createAdminClient()
    .from('subcontractors')
    .select('company_name, status')
    .eq('id', ntp.subcontractor_id)
    .maybeSingle();
  if (!sub || sub.status === 'terminated') {
    return (
      <div className="pt-card pt-narrow">
        <h1>This agreement is no longer available</h1>
      </div>
    );
  }
  return (
    <div className="pt-wrap">
      <section className="pt-hero">
        <p className="pt-kicker">{ntp.ref}</p>
        <h1>NTP agreement for {ntp.ntp_name}</h1>
        <p className="pt-banner is-info">
          Heliaxis would like to appoint you, through {sub.company_name}, as its Nominated Technical Person. Please read the
          agreement, then sign at the bottom.
        </p>
      </section>
      <div className="pt-card">
        <div className="pt-doc">
          <NtpDocument snapshot={ntp.snapshot} showAudit={false} />
        </div>
        <NtpSignForm token={token} hash={ntp.content_hash} defaultName={ntp.ntp_name} />
      </div>
    </div>
  );
}
