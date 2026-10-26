import { NextResponse } from 'next/server';
import { geocodePostcodes } from '@/lib/geocode-postcode';
import { fallbackYield } from '@/lib/estimator/calc';
import { pvgisYield } from '@/lib/estimator/pvgis';
import { roofFromGoogle, type GoogleBuilding, type RoofFound } from '@/lib/estimator/roof';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'private, max-age=600' } });

type Found = { found: true; address: string; lat: number; lng: number; roof: RoofFound; kwhPerKwp: number; monthly: number[] | null; imageryDate: string | null };
type Miss = { found: false; reason: 'not_configured' | 'bad_address' | 'no_address' | 'not_covered' | 'busy' | 'error' };

/** Same address asked again within a day is answered from memory (so it is only billed once). */
const cache = new Map<string, { at: number; value: Found | Miss }>();
const perIp = new Map<string, number[]>();
let day = { key: '', n: 0 };

function allowed(ip: string): 'ok' | 'ip' | 'day' {
  const now = Date.now();
  const recent = (perIp.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 15) return 'ip';
  const today = new Date().toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, n: 0 };
  if (day.n >= Number(process.env.SOLAR_LOOKUPS_PER_DAY || 200)) return 'day';
  recent.push(now);
  perIp.set(ip, recent);
  day.n++;
  if (perIp.size > 5000) perIp.clear();
  return 'ok';
}

type Geo = { lat: number; lng: number; address: string };

/**
 * House number and postcode to a point on the building. Mapbox (as SimpliPV uses) when MAPBOX_TOKEN is set, otherwise
 * Google's Geocoding with the Solar key. Only an address-level answer is used: a street or postcode centre could
 * land on a neighbour's roof, and showing the wrong roof is worse than asking the questions.
 */
async function geocode(line: string, pc: string): Promise<Geo | null> {
  const query = `${line}, ${pc}`;
  const mapbox = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (mapbox) {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapbox}&country=GB&types=address&limit=1`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    const f = r?.ok ? ((await r.json()) as { features?: { center?: number[]; place_name?: string; properties?: { accuracy?: string }; context?: { id?: string; text?: string }[] }[] }).features?.[0] : null;
    const acc = f?.properties?.accuracy;
    const postcodeBack = (f?.context ?? []).find((c) => c.id?.startsWith('postcode'))?.text?.replace(/\s+/g, '').toUpperCase();
    if (f?.center && (acc === 'rooftop' || acc === 'parcel' || acc === 'point') && (!postcodeBack || postcodeBack === pc.replace(/\s+/g, ''))) {
      return { lng: f.center[0], lat: f.center[1], address: String(f.place_name || query) };
    }
    return null;
  }
  const key = process.env.GOOGLE_SOLAR_API_KEY;
  if (!key) return null;
  const referer = process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk';
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=gb&components=country:GB&key=${key}`, { headers: { Referer: referer }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  const g = r?.ok ? ((await r.json()) as { results?: { geometry?: { location?: { lat: number; lng: number }; location_type?: string }; formatted_address?: string }[] }).results?.[0] : null;
  if (g?.geometry?.location && g.geometry.location_type === 'ROOFTOP') return { lat: g.geometry.location.lat, lng: g.geometry.location.lng, address: g.formatted_address || query };
  return null;
}

async function solar(lat: number, lng: number, key: string): Promise<{ b: GoogleBuilding & { imageryDate?: { year: number; month: number; day: number } } | null; error: boolean }> {
  const referer = process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk';
  for (const quality of ['HIGH', 'MEDIUM']) {
    const u = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest');
    u.searchParams.set('location.latitude', String(lat));
    u.searchParams.set('location.longitude', String(lng));
    u.searchParams.set('requiredQuality', quality);
    u.searchParams.set('key', key);
    // The key may be limited to certain websites: say which one is asking (as SimpliPV does), or Google refuses a server call.
    const r = await fetch(u, { headers: { Referer: referer }, signal: AbortSignal.timeout(9000) }).catch(() => null);
    if (!r) return { b: null, error: true };
    if (r.status === 404) continue;
    if (!r.ok) return { b: null, error: true };
    return { b: await r.json(), error: false };
  }
  return { b: null, error: false };
}

/**
 * The roof at an address, from Google's Solar API. ?pc=NP265ST&line=2 Marine Terrace
 * Answers { found: false, reason } whenever it can't give a trustworthy roof, and the estimator then asks its questions.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const pc = (u.searchParams.get('pc') || '').trim().toUpperCase().slice(0, 9);
  const line = (u.searchParams.get('line') || '').trim().slice(0, 80);
  const key = process.env.GOOGLE_SOLAR_API_KEY;
  if (!key) return json({ found: false, reason: 'not_configured' } satisfies Miss);
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(pc)) return json({ found: false, reason: 'bad_address' } satisfies Miss);
  if (line.length < 1) return json({ found: false, reason: 'no_address' } satisfies Miss);

  const ck = `${pc.replace(/\s+/g, '')}|${line.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 86400_000) return json(hit.value);

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'x';
  if (allowed(ip) !== 'ok') return json({ found: false, reason: 'busy' } satisfies Miss);

  let result: Found | Miss = { found: false, reason: 'error' };
  try {
    const geo = await geocode(line, pc);
    if (!geo) result = { found: false, reason: 'bad_address' };
    else {
      const { b, error } = await solar(geo.lat, geo.lng, key);
      const first = b ? roofFromGoogle(b, fallbackYield('south', 'typical')) : null;
      if (error) result = { found: false, reason: 'error' };
      else if (!b || !first) result = { found: false, reason: 'not_covered' };
      else {
        const y = await pvgisYield(geo.lat, geo.lng, first.angle, first.aspect);
        const roof = roofFromGoogle(b, y?.kwhPerKwp ?? fallbackYield(first.direction, 'typical')) ?? first;
        const d = b.imageryDate;
        result = { found: true, address: geo.address, lat: geo.lat, lng: geo.lng, roof, kwhPerKwp: y?.kwhPerKwp ?? fallbackYield(roof.direction, 'typical'), monthly: y?.monthly ?? null, imageryDate: d ? `${d.year}-${String(d.month).padStart(2, '0')}` : null };
      }
    }
  } catch {
    result = { found: false, reason: 'error' };
  }
  if (result.found || (result as Miss).reason !== 'error') cache.set(ck, { at: Date.now(), value: result });
  if (cache.size > 2000) cache.clear();
  return json(result);
}
