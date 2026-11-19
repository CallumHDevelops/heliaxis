import { NextResponse } from 'next/server';
import { runSearchJobs } from '@/lib/search/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Search's one dispatcher (spec §7), every 10 minutes from Supabase pg_cron: queues what the schedule says is due (the
 * weekly SERPs, Search Console, the site audit, reports), then runs due jobs for up to four minutes.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const out = await runSearchJobs({ until: Date.now() + 240_000 });
  return NextResponse.json({ ok: true, ...out });
}
