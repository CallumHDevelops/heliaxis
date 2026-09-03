import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { geocodePostcode, looksLikePostcode } from '@/lib/location/postcodes';
import { isWhat3WordsEnabled, whatThreeWords } from '@/lib/location/what3words';

/** Postcode → coordinates (+ what3words). Free path, no API key required. */
export async function GET(request: Request) {
  const { profile } = await getSession();
  if (profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const pc = new URL(request.url).searchParams.get('pc') ?? '';
  if (!looksLikePostcode(pc)) {
    return NextResponse.json({ error: 'That does not look like a UK postcode' }, { status: 400 });
  }

  const geo = await geocodePostcode(pc);
  if (!geo) {
    return NextResponse.json({ error: 'Postcode not found' }, { status: 404 });
  }

  const w3w = await whatThreeWords(geo.lat, geo.lng);

  return NextResponse.json({
    postcode: geo,
    what3words: w3w?.words ?? null,
    what3wordsEnabled: isWhat3WordsEnabled(),
  });
}
