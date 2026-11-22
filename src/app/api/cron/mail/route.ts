import { NextResponse } from 'next/server';
import { runMailSort } from '@/lib/mail/sync';
import { pushWidgets } from '@/lib/widget';

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
 * (src/lib/mail/sync.ts). Then the Hestia widget on people's phones (src/lib/widget.ts). Nothing new starts after
 * 52 s, inside the 60 s limit.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  const boxes = await runMailSort({ until: started + 40_000 }).catch((e) => [{ error: e instanceof Error ? e.message : 'failed' }]);
  // The Hestia widget on people's phones: every 15 minutes, and now for anyone whose emails just changed.
  const changed = boxes.flatMap((b) => ('userId' in b && (b.triaged || b.marked || b.drafted) ? [b.userId] : []));
  const widgets = await pushWidgets({ now: changed, until: started + 52_000 }).catch(() => 0);
  return NextResponse.json({ ok: true, boxes, widgets });
}
