import { NextResponse } from 'next/server';
import { runReportJobs } from '@/lib/report/build';

export const dynamic = 'force-dynamic';
// A step gathers data for up to 50 s; the write-up at the end takes a minute or two.
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * The CMS report (src/lib/report/build.ts): starts the scheduled SEO and GEO report when it's due and
 * builds it a stage at a time. Every 5 minutes from Supabase pg_cron (seo-report.sql), and once a day
 * from vercel.json.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await runReportJobs({ until: Date.now() + 50_000, schedule: true });
  return NextResponse.json({ ok: !result.error, ...result }, { status: result.error ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}
