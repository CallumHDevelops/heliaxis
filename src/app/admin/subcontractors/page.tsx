import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { compliance } from '@/lib/subcontractors/documents';
import { type DocumentRow, type SubcontractorRow } from '@/lib/subcontractors/types';
import { SubcontractorsList, type ListRow } from './SubcontractorsList';
import { lastReminderRun } from '@/lib/subcontractors/reminders';
import './subcontractors.css';

export const dynamic = 'force-dynamic';
// Bulk emails (fresh links) run as server actions on this page.
export const maxDuration = 60;

export default async function SubcontractorsPage() {
  const { profile } = await getSessionProfile();
  const admin = createAdminClient();
  const lastRun = await lastReminderRun().catch(() => ({ available: false as const }));
  const [{ data: subs, error }, { data: docs }, { count: unprocessed, error: v4Missing }] = await Promise.all([
    // '*' so the CIS verification columns come along once supabase/portal-v3.sql has run.
    admin.from('subcontractors').select('*').order('created_at', { ascending: false }),
    admin
      .from('subcontractor_documents')
      .select('id, subcontractor_id, category, label, operative_name, expires_on, status, uploaded_at'),
    admin.from('subcontractor_documents').select('id', { count: 'exact', head: true }).is('processed_at', null),
  ]);

  const bySub = new Map<string, DocumentRow[]>();
  for (const d of (docs ?? []) as DocumentRow[]) {
    bySub.set(d.subcontractor_id, [...(bySub.get(d.subcontractor_id) ?? []), d]);
  }

  const rows: ListRow[] = ((subs ?? []) as SubcontractorRow[]).map((s) => {
    const c = compliance(s.details || {}, bySub.get(s.id) ?? []);
    return {
      id: s.id,
      ref: s.ref,
      companyName: s.company_name,
      contactName: s.contact_name,
      email: s.email,
      trade: s.trade,
      status: s.status,
      invitedAt: s.invited_at,
      lastSeenAt: s.last_seen_at,
      docCount: bySub.get(s.id)?.length ?? 0,
      missing: c.missing,
      expired: c.expired.length,
      expiring: c.expiring.length,
      pendingReview: c.pendingReview,
      cisRate: s.cis_verified_on ? (s.cis_rate ?? null) : null,
      cisVerified: !!s.cis_verified_on,
    };
  });

  return (
    <AdminShell active="subcontractors" isAdmin={profile?.role === 'admin'}>
      {error ? (
        <div className="sc-page">
          <h1>Subcontractors</h1>
          <p className="sc-error">
            Couldn&apos;t load subcontractors ({error.message}). If this is the first run, apply{' '}
            <code>supabase/subcontractors.sql</code> in the Supabase SQL editor.
          </p>
        </div>
      ) : (
        <>
          <ReminderStatus lastRun={lastRun} />
          <SubcontractorsList
            rows={rows}
            recipients={rows.filter((r) => r.status !== 'terminated' && r.email).length}
            unprocessed={v4Missing ? null : unprocessed ?? 0}
          />
        </>
      )}
    </AdminShell>
  );
}

/** Is the daily reminder job running? Silent failure here means nobody gets chased. */
function ReminderStatus({ lastRun }: { lastRun: Awaited<ReturnType<typeof lastReminderRun>> }) {
  if (!lastRun.available) {
    return <p className="sc-banner is-warn sc-page">Automatic reminders need setting up: run supabase/reminders.sql in Supabase.</p>;
  }
  const run = lastRun.run;
  if (!run || lastRun.hoursAgo > 26) {
    return (
      <p className="sc-banner is-err sc-page">
        Automatic reminders {run ? `haven't run since ${new Date(run.ran_at).toLocaleString('en-GB')}` : "haven't run yet"}. Check
        CRON_SECRET is set in Vercel (Settings → Environment Variables) and redeploy.
      </p>
    );
  }
  const r = (run.summary?.reminders ?? {}) as { digests?: number; adminNotes?: number; error?: string };
  return (
    <p className={`sc-banner ${run.ok ? 'is-ok' : 'is-err'} sc-page`}>
      Automatic reminders last ran {new Date(run.ran_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
      {run.ok ? ` — ${r.digests ?? 0} reminder email${r.digests === 1 ? '' : 's'} sent.` : ` — with an error: ${r.error ?? 'see logs'}.`}
    </p>
  );
}
