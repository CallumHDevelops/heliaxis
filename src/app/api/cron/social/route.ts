import { NextResponse } from 'next/server';
import { sendDueAlerts } from '@/lib/social/alerts';
import { runDailySnapshots } from '@/lib/social/insights/collect';
import { runSocialJobs } from '@/lib/social/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Every minute (Supabase pg_cron, see supabase/social-monitoring.sql): sends High alerts whose quiet
 * hours have ended, runs queued jobs (the AI classification of new comments), and takes the daily metric snapshots.
 */
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const deferredSent = await sendDueAlerts().catch(() => 0);
  const jobs = await runSocialJobs().catch((e) => ({ error: e instanceof Error ? e.message : 'failed' }));
  // Once a day after 02:15: followers, views and post figures from Facebook and Instagram.
  const snapshots = await runDailySnapshots().catch(() => ({ ran: false }));
  return NextResponse.json({ ok: true, deferredSent, jobs, snapshots });
}
export const GET = run;
export const POST = run;
