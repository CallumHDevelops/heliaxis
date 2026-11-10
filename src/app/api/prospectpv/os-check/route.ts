/** GET /api/prospectpv/os-check — does the OS key work for search, counting and map tiles? Staff only. */
import { NextResponse } from 'next/server';
import { staffOrNull } from '@/lib/prospectpv/server/auth';
import { checkOsConnection } from '@/lib/prospectpv/server/osPlaces';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await staffOrNull())) return NextResponse.json({ message: 'Sign in to check.' }, { status: 401 });
  return NextResponse.json({ checks: await checkOsConnection() }, { headers: { 'Cache-Control': 'private, no-store' } });
}
