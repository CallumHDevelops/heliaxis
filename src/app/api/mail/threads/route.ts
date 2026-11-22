import { NextResponse } from 'next/server';
import { mailSession, threadsFor, type View } from '@/lib/mail/server';

export const dynamic = 'force-dynamic';

const VIEWS: View[] = ['reply', 'waiting', 'people', 'fyi', 'marketing'];

/** My email: one list (?view=reply|waiting|people|fyi|marketing). */
export async function GET(req: Request) {
  const s = await mailSession();
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: s.status });
  if (!s.box) return NextResponse.json({ rows: [] });
  const v = new URL(req.url).searchParams.get('view') as View;
  const rows = await threadsFor(s.db, s.box.id, VIEWS.includes(v) ? v : 'reply');
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}
