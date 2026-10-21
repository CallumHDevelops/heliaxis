import { redirect } from 'next/navigation';
import { getPortalSub } from '@/lib/subcontractors/session';
import { SignIn } from './SignIn';

export const dynamic = 'force-dynamic';

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  if (await getPortalSub()) redirect('/portal/app');
  const { link } = await searchParams;
  return (
    <div className="pt-card pt-narrow">
      <h1>Subcontractor portal</h1>
      <p className="pt-muted">
        Sign your agreements, manage your team, keep ID, cards and insurance up to date, and choose who goes on each job.
      </p>
      {link === 'expired' && (
        <p className="pt-banner is-warn">That link has expired or been replaced. Sign in with your email below instead.</p>
      )}
      <SignIn />
      <p className="pt-hint" style={{ marginTop: '1.25rem' }}>
        Use the email address Heliaxis has on file for your business. Problems? Call{' '}
        <a href="tel:01633965205">01633 965205</a> or email <a href="mailto:hello@heliaxis.co.uk">hello@heliaxis.co.uk</a>.
      </p>
    </div>
  );
}
