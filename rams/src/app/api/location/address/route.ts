import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isAddressLookupEnabled, resolveAddress } from '@/lib/location/getaddress';
import { geocodePostcode } from '@/lib/location/postcodes';
import { isWhat3WordsEnabled, whatThreeWords } from '@/lib/location/what3words';

/**
 * Resolve a chosen suggestion to a full address, and enrich it with
 * coordinates and a what3words address in one round trip.
 */
export async function GET(request: Request) {
  const { profile } = await getSession();
  if (profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  if (!isAddressLookupEnabled()) {
    return NextResponse.json({ error: 'Address lookup is not configured' }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get('id') ?? '';
  const address = await resolveAddress(id);
  if (!address) {
    return NextResponse.json({ error: 'That address could not be resolved' }, { status: 404 });
  }

  // Not every getAddress.io plan returns coordinates, and we need them for both
  // what3words and the A&E search — fall back to the postcode centroid.
  let lat = address.lat;
  let lng = address.lng;
  if ((lat === null || lng === null) && address.postcode) {
    const geo = await geocodePostcode(address.postcode);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  const w3w = lat !== null && lng !== null ? await whatThreeWords(lat, lng) : null;

  return NextResponse.json({
    address: { ...address, lat, lng },
    what3words: w3w?.words ?? null,
    what3wordsEnabled: isWhat3WordsEnabled(),
  });
}
