import { NextResponse } from 'next/server';
import { runGeoJobs } from '@/lib/geo/run';

export const dynamic = 'force-dynamic';
// One step answers questions for 45 s; the analysis after the last answer takes a minute or two.
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * The GEO bot (src/lib/geo/run.ts): starts the scheduled AI-visibility check when it's due, puts a
 * few of its questions to the AI engines, and writes the analysis and suggested website changes once
 * the answers are in. Every 5 minutes from Supabase pg_cron (geo.sql), and once a day from vercel.json.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runGeoJobs({ until: Date.now() + 45_000, schedule: true });
  return NextResponse.json({ ok: !result.error, ...result }, { status: result.error ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}
