import { NextResponse } from 'next/server';
import { ukDay } from '@/lib/bank-holidays';
import { calendarFor } from '@/lib/install-availability';
import { projectByToken, projectSigned } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

/** Three weeks of installation dates for a customer who has accepted: ?from=YYYY-MM-DD for another three weeks. Only free, nearly full, full or closed: never who else is booked. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await projectByToken(token);
  if (!p || !(await projectSigned(p))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { cal } = await calendarFor(ukDay(new Date()), new URL(req.url).searchParams.get('from'), p.id);
  return NextResponse.json(cal, { headers: { 'Cache-Control': 'no-store' } });
}
