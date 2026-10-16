import { NextResponse } from 'next/server';
import { processOutbox } from '@/lib/whatsapp/inbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** Every minute (Supabase pg_cron → see supabase/whatsapp.sql): send smart replies that are due. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await processOutbox();
  return NextResponse.json({ ok: true, ...result });
}
