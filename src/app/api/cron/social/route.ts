import { NextResponse } from 'next/server';
import { sendDueAlerts } from '@/lib/social/alerts';
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
 * hours have ended, then runs queued jobs (the AI classification of new comments). Polling is added later.
 */
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const deferredSent = await sendDueAlerts().catch(() => 0);
  const jobs = await runSocialJobs().catch((e) => ({ error: e instanceof Error ? e.message : 'failed' }));
  return NextResponse.json({ ok: true, deferredSent, jobs });
}
export const GET = run;
export const POST = run;
