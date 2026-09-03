import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { nearestAandE } from '@/lib/location/hospitals';
import { geocodePostcode } from '@/lib/location/postcodes';

/**
 * Candidate A&E departments near the site. Suggestions only — the caller
 * confirms one, because OSM cannot reliably tell a major A&E from a UTC.
 */
export async function GET(request: Request) {
  const { profile } = await getSession();
  if (profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  let lat = Number(params.get('lat'));
  let lng = Number(params.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const pc = params.get('pc');
    const geo = pc ? await geocodePostcode(pc) : null;
    if (!geo) {
      return NextResponse.json(
        { error: 'Provide coordinates, or a postcode we can locate' },
        { status: 400 }
      );
    }
    lat = geo.lat;
    lng = geo.lng;
  }

  const candidates = await nearestAandE(lat, lng);

  return NextResponse.json({
    candidates,
    note: 'OpenStreetMap data. Confirm the department accepts major trauma before relying on it.',
  });
}
