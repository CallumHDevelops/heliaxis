import { NextResponse } from 'next/server';
import { checkRamsKey, loadPortalFirms, noStore } from '@/lib/subcontractors/rams-api';

export const dynamic = 'force-dynamic';

/** RAMS: every countersigned firm with its team and approved documents (metadata only). */
export async function GET(req: Request) {
  const denied = checkRamsKey(req);
  if (denied) return denied;
  return NextResponse.json({ subcontractors: await loadPortalFirms() }, { headers: noStore });
}
