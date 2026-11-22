import { NextResponse } from 'next/server';
import { runMailSort } from '@/lib/mail/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Every two minutes (Supabase pg_cron, see supabase/mail-sort.sql): My email for each connected mailbox: reads new
 * emails, works through the first read, spots what needs a reply, drafts replies and files what's dealt with
 * (src/lib/mail/sync.ts). It starts no new work after 45 s, inside the 60 s limit.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const boxes = await runMailSort({ until: Date.now() + 45_000 }).catch((e) => [{ error: e instanceof Error ? e.message : 'failed' }]);
  return NextResponse.json({ ok: true, boxes });
}
