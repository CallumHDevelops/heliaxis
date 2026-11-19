import { NextResponse } from 'next/server';
import { readRunStatus, runRankingsAndCompetitors, serpConfigured } from '@/lib/seo/serp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** Starts a rankings run by hand (the weekly one is queued by /api/cron/growth, Sunday 23:00). Results arrive by pingback. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!serpConfigured()) return NextResponse.json({ ok: false, reason: 'DataForSEO not set up' });
  await runRankingsAndCompetitors();
  return NextResponse.json({ ok: true, status: await readRunStatus() });
}
