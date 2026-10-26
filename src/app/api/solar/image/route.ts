import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MAP_ZOOM } from '@/lib/estimator/overlay';
import { signView } from '@/lib/estimator/sign';

export const dynamic = 'force-dynamic';

let day = { key: '', n: 0 };

/**
 * The satellite picture for a roof, from Google's static map (centred on the building, 640 x 640, at double size). The key
 * stays on the server, a link only works with the signature from our own lookup, and there is a daily limit.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat'));
  const lng = Number(u.searchParams.get('lng'));
  const sig = u.searchParams.get('sig') || '';
  const key = process.env.GOOGLE_SOLAR_API_KEY;
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return new NextResponse(null, { status: 404 });
  const want = Buffer.from(signView(lat, lng));
  const got = Buffer.from(sig.padEnd(want.length, ' ').slice(0, want.length));
  if (!timingSafeEqual(want, got) || sig.length !== want.length) return new NextResponse(null, { status: 403 });
  const today = new Date().toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, n: 0 };
  if (++day.n > Number(process.env.SOLAR_PICTURES_PER_DAY || 300)) return new NextResponse(null, { status: 429 });
  const referer = process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk';
  const r = await fetch(`https://maps.googleapis.com/maps/api/staticmap?center=${lat.toFixed(6)},${lng.toFixed(6)}&zoom=${MAP_ZOOM}&size=640x640&scale=2&maptype=satellite&key=${key}`, { headers: { Referer: referer }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return new NextResponse(null, { status: 404 });
  return new NextResponse(await r.arrayBuffer(), { headers: { 'Content-Type': r.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } });
}
