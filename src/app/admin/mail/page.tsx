import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requireApproved } from '@/lib/auth';
import { msConfigured } from '@/lib/ms365';
import { boxFor, countsFor, threadsFor } from '@/lib/mail/server';
import { canAccess } from '@/lib/portals';
import { createAdminClient } from '@/lib/supabase/admin';
import { MailView } from './MailView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'My email · Heliaxis', robots: { index: false, follow: false } };

/** My email: your own mailbox, sorted (src/lib/mail). Only ever the signed-in person's own. */
export default async function MailPage({ searchParams }: { searchParams: Promise<{ t?: string; tab?: string }> }) {
  const s = await requireApproved();
  if (!s) redirect('/login?next=/admin/mail');
  const { t, tab } = await searchParams;
  const db = createAdminClient();
  const box = await boxFor(s.user.id, db);
  const ready = box && box !== 'missing';
  const [counts, rows] = ready ? await Promise.all([countsFor(db, box.id), threadsFor(db, box.id, 'reply')]) : [null, []];
  return (
    <AdminShell active="mail" fluid>
      <MailView
        missing={box === 'missing'}
        connected={msConfigured()}
        email={String(s.profile.email || s.user.email || '')}
        hasBox={!!ready}
        counts={counts}
        initialRows={rows}
        openId={t ?? null}
        startTab={tab ?? null}
        canCrm={canAccess(s.profile, 'crm')}
      />
    </AdminShell>
  );
}
