import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isWhat3WordsEnabled, whatThreeWords } from '@/lib/location/what3words';

/** Coordinates → what3words address. */
export async function GET(request: Request) {
  const { profile } = await getSession();
  if (profile?.status !== 'approved') {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  if (!isWhat3WordsEnabled()) {
    return NextResponse.json({ enabled: false, words: null });
  }

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const result = await whatThreeWords(lat, lng);
  return NextResponse.json({ enabled: true, words: result?.words ?? null });
}
