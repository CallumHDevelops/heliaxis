import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDue } from './send';
import { siteReady, type Db } from './server';
import { finishSignoffs } from './signoff';
import { strikeReminders } from './strike';
import { retryReads } from './vision';

/**
 * /api/cron/site: every 5 minutes from pg_cron (the line in site-commissioning.sql) and once a day
 * from the Vercel cron. Each job is independent: one failing never stops the rest, and each starts no
 * new work once `until` has passed (Vercel's 60 s limit). Later work adds its jobs to SITE_JOBS.
 */

export type SiteJob = { name: string; run: (db: Db, until: number) => Promise<unknown> };

/** Devices unused for this long are signed out; site_ops older than this are pruned. */
const OPS_DAYS = 60;

export const SITE_JOBS: SiteJob[] = [
  // 4. Strike photos asked for (and chased) after the scaffold's down date: queued first, so the
  // messages job below sends them in the same run.
  { name: 'strike', run: (db) => strikeReminders(db) },
  // 2. Sign-offs whose steps after the reply didn't all run (the PO issued, the report, the owner told):
  // before the messages, so a PO email it queues goes in the same run.
  { name: 'signoffs', run: (db, until) => finishSignoffs(db, until) },
  // 1. Messages whose time has come (held overnight by the evening rule, or retried).
  { name: 'messages', run: (db) => sendDue(db) },
  // 3. Label photos that arrived while nobody was waiting on the read.
  { name: 'reads', run: (db) => retryReads(db) },
  // 6. Phones not used for 90 days have to open their link again.
  {
    name: 'devices',
    run: async (db) => {
      const { data } = await db.from('site_devices').update({ revoked_at: new Date().toISOString() }).lt('expires_at', new Date().toISOString()).is('revoked_at', null).select('id');
      return data?.length ?? 0;
    },
  },
  // 7. Replays older than 60 days can't happen any more.
  {
    name: 'ops',
    run: async (db) => {
      const { data } = await db.from('site_ops').delete().lt('at', new Date(Date.now() - OPS_DAYS * 86_400_000).toISOString()).select('op_id');
      return data?.length ?? 0;
    },
  },
];

/** Add a job to the run (the sign-off steps, label reads, strike reminders, handover tasks). */
export function addSiteJob(job: SiteJob) {
  if (!SITE_JOBS.some((j) => j.name === job.name)) SITE_JOBS.push(job);
}

export async function runSiteJobs(started = Date.now()): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  if (!(await siteReady())) return { ok: true, result: { skipped: 'site-commissioning.sql not run' } };
  const db = createAdminClient();
  const until = started + 45_000;
  const result: Record<string, unknown> = {};
  let ok = true;
  for (const job of SITE_JOBS) {
    if (Date.now() > until) {
      result[job.name] = 'later';
      continue;
    }
    try {
      result[job.name] = await job.run(db, until);
    } catch (e) {
      ok = false;
      result[job.name] = { error: e instanceof Error ? e.message : String(e) };
      console.error(`[cron/site] ${job.name}`, e);
    }
  }
  await db
    .from('cron_runs')
    .insert({ job: 'site', ok, summary: result })
    .then(
      () => null,
      () => null
    );
  return { ok, result };
}
