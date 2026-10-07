import { NextResponse } from 'next/server';
import { bad, checkRamsKey, loadPortalFirms, noStore } from '@/lib/subcontractors/rams-api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkRamsKey(req);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Not found', 404);
  const [firm] = await loadPortalFirms(id);
  if (!firm) return bad('Not found or not active', 404);
  return NextResponse.json({ subcontractor: firm }, { headers: noStore });
}
