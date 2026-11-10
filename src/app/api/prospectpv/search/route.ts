/** GET /api/prospectpv/search?q=… — address or postcode lookup for the map. Staff only. */
import { NextResponse, type NextRequest } from 'next/server';
import { staffOrNull } from '@/lib/prospectpv/server/auth';
import { findPlaces, logOsCall, OsError } from '@/lib/prospectpv/server/osPlaces';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await staffOrNull())) return NextResponse.json({ message: 'Sign in to search.' }, { status: 401 });
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 3) return NextResponse.json({ places: [] });
  try {
    const places = await findPlaces(q);
    await logOsCall('find', 200);
    return NextResponse.json({ places }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    await logOsCall('find', e instanceof OsError ? (e.status ?? null) : null);
    const message = e instanceof OsError ? e.message : 'Search isn’t working right now.';
    return NextResponse.json({ message }, { status: e instanceof OsError && e.kind === 'no_key' ? 503 : 502 });
  }
}
