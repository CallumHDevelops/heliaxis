import { NextResponse } from 'next/server';
import { geocodePostcodes } from '@/lib/geocode-postcode';
import { DIRECTIONS, PITCHES, fallbackYield } from '@/lib/estimator/calc';
import { pvgisYield } from '@/lib/estimator/pvgis';

export const dynamic = 'force-dynamic';

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });

/** A visitor may ask this a limited number of times an hour (it calls two outside services). */
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 60;
}

/**
 * The yield for a roof: kWh a year and by month for a 1 kWp system, from the EU's PVGIS service for the postcode's
 * coordinates, the roof's direction and pitch. If PVGIS can't be reached the answer is the fallback table (and says so),
 * so the estimator always works. ?pc=NP151DG&dir=south&pitch=typical
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const pc = (u.searchParams.get('pc') || '').trim().toUpperCase().slice(0, 9);
  const dir = DIRECTIONS.find((d) => d.key === u.searchParams.get('dir')) ?? DIRECTIONS[1];
  const pitch = PITCHES.find((p) => p.key === u.searchParams.get('pitch')) ?? PITCHES[2];
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'x';
  if (limited(ip)) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  const fallback = { kwhPerKwp: fallbackYield(dir.key, pitch.key), monthly: null as number[] | null, town: '', source: 'fallback' as const };
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s?\d?[A-Z]{0,2}$/.test(pc)) return json({ ...fallback, error: 'Check the postcode.' });

  try {
    const geo = (await geocodePostcodes([pc])).get(pc.replace(/\s+/g, ''));
    if (!geo) return json({ ...fallback, error: 'We couldn’t find that postcode.' });
    const y = await pvgisYield(geo.lat, geo.lng, pitch.angle, dir.aspect);
    if (!y) return json({ ...fallback, town: geo.town });
    return json({ kwhPerKwp: y.kwhPerKwp, monthly: y.monthly, town: geo.town, source: 'pvgis' as const });
  } catch {
    return json(fallback);
  }
}
