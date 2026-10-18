import { NextResponse } from 'next/server';
import { availableSlots } from '@/lib/crm/booking';
import { projectByToken } from '@/lib/crm/portal';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await projectByToken(token))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await availableSlots(), { headers: { 'Cache-Control': 'no-store' } });
}
