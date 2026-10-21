import { NextResponse } from 'next/server';
import { runSiteJobs } from '@/lib/site/cron';
// The handover pack's job (held messages, documents made as their data lands).
import '@/lib/handover/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * The site app's background work (src/lib/site/cron.ts): messages held overnight, sign-off steps
 * left unfinished, label reads to retry, scaffold strike reminders, expired phones, old replays. Every
 * 5 minutes from Supabase pg_cron (site-commissioning.sql), and once a day from vercel.json.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ok, result } = await runSiteJobs();
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
