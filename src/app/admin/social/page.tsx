import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Social monitoring · Heliaxis',
  robots: { index: false, follow: false },
};

/**
 * Operations › Social monitoring. For now an empty shell: the Inbox, Review screen and the rest arrive
 * ticket by ticket (docs/social-monitoring/13-tickets.md). Only admins and members with the
 * Social monitoring tick can open it (src/middleware.ts checks the path, this checks again).
 */
export default async function SocialMonitoringPage() {
  const session = await requirePortal('social_monitoring');
  if (!session) redirect('/admin');
  const ready = await schemaReady();
  const isAdmin = session.profile.role === 'admin';

  return (
    <AdminShell active="social">
      <h1>Social monitoring</h1>
      {!ready.social ? (
        <p>
          Social monitoring isn&apos;t set up in the database yet.
          {isAdmin ? (
            <>
              {' '}
              Run <code>social-monitoring.sql</code> from the <Link href="/admin">dashboard setup to-dos</Link> (it&apos;s safe to run twice).
            </>
          ) : (
            ' Ask an admin to finish the setup.'
          )}
        </p>
      ) : (
        <p>Nothing here yet. Comments and reviews about Heliaxis will appear here once the sources are connected.</p>
      )}
    </AdminShell>
  );
}
