/**
 * Server-only: OS Places API (address search and counting homes in a drawn area).
 *
 * REUSE: the Heliaxis admin repo has an OS client. Swap `osKey()` and `osFetch()`
 * for it when this joins that repo.
 *
 * UNVERIFIED against live docs (docs.os.uk wasn't reachable when this was
 * written). Check each before first use with a real key, per
 * MAP_ASSESS_REFERENCE sections 4A and 12:
 *   - polygon endpoint: POST /search/places/v1/polygon, GeoJSON body, `srs`,
 *     `maxresults` 1-100, `offset`, header.totalresults
 *   - residential filter syntax: fq=CLASSIFICATION_CODE:RD*  (and the code list)
 *   - the key as a `key` query parameter
 * Everything that might change sits in the constants below.
 */
import 'server-only';
import type { MultiPolygonGeometry } from '../mapArea';
import { supabaseAdmin } from './supabaseAdmin';

export const OS_PLACES_BASE = 'https://api.os.uk/search/places/v1';
/** Residential dwellings. [verify] the exact fq syntax and wildcard use. */
export const RESIDENTIAL_FQ = 'CLASSIFICATION_CODE:RD*';

export class OsError extends Error {
  constructor(public kind: 'no_key' | 'auth' | 'rate_limited' | 'bad_request' | 'unavailable' | 'bad_response', message: string, public status?: number) {
    super(message);
  }
}

export function osKey(): string {
  const key = process.env.OS_DATAHUB_KEY ?? process.env.PROSPECTPV_OS_API_KEY;
  if (!key) throw new OsError('no_key', 'The OS Data Hub key isn’t set (PROSPECTPV_OS_API_KEY).');
  return key;
}

type Fetcher = typeof fetch;

/** The short reason out of an OS error body, with anything key-shaped removed. */
function detail(body: string): string {
  let t = body;
  try {
    const j = JSON.parse(body) as { fault?: { faultstring?: string }; error?: { message?: string }; message?: string };
    t = j.fault?.faultstring ?? j.error?.message ?? j.message ?? body;
  } catch { /* plain text */ }
  return t.replace(/key=[^&\s"']+/gi, 'key=…').replace(/[\r\n]+/g, ' ').trim().slice(0, 140);
}

async function osFetch(f: Fetcher, url: URL, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await f(url, { ...init, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  } catch {
    throw new OsError('unavailable', 'The address service didn’t answer. Try again in a moment.');
  }
  if (res.status === 401 || res.status === 403) {
    // OS says why in the body (an invalid key, or a plan without this API). Shown to staff so it can be fixed; the key is never in it.
    const why = await res.text().then((t) => detail(t)).catch(() => '');
    throw new OsError('auth', `The OS key was refused${why ? ` (${why})` : ''}. Check it, and that its plan includes OS Places.`, res.status);
  }
  if (res.status === 429) throw new OsError('rate_limited', 'The address service is busy. Try again in a minute.', 429);
  if (res.status === 400) throw new OsError('bad_request', 'The address service couldn’t use that area.', 400);
  if (!res.ok) throw new OsError('unavailable', `The address service is unavailable (${res.status}).`, res.status);
  try {
    return { status: res.status, json: await res.json() };
  } catch {
    throw new OsError('bad_response', 'The address service sent something unreadable.', res.status);
  }
}

/** Never put the key in an error or a log line. */
const withKey = (u: URL) => { u.searchParams.set('key', osKey()); return u; };

/** Cheap call: how many homes are inside the area (maxresults=1, read totalresults). */
export async function countHomesInArea(area: MultiPolygonGeometry, f: Fetcher = fetch): Promise<number> {
  const url = withKey(new URL(`${OS_PLACES_BASE}/polygon`));
  url.searchParams.set('srs', 'EPSG:4326');
  url.searchParams.set('maxresults', '1');
  url.searchParams.set('fq', RESIDENTIAL_FQ);
  const { json } = await osFetch(f, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Feature', geometry: area }),
  });
  const total = (json as { header?: { totalresults?: unknown } })?.header?.totalresults;
  // An area with no results may omit the field; treat a missing total with no results as zero.
  if (total === undefined) {
    const results = (json as { results?: unknown[] })?.results;
    if (!results || results.length === 0) return 0;
    throw new OsError('bad_response', 'The address service didn’t say how many homes there are.');
  }
  const n = Number(total);
  if (!Number.isFinite(n) || n < 0) throw new OsError('bad_response', 'The address service gave a count that doesn’t make sense.');
  return Math.floor(n);
}

export type PlaceHit = { uprn: string; address: string; lat: number; lng: number };

/** Address or postcode search, used to fly the map somewhere. */
export async function findPlaces(query: string, f: Fetcher = fetch): Promise<PlaceHit[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 3) return [];
  const url = withKey(new URL(`${OS_PLACES_BASE}/find`));
  url.searchParams.set('query', q);
  url.searchParams.set('maxresults', '5');
  url.searchParams.set('output_srs', 'WGS84');
  const { json } = await osFetch(f, url);
  const rows = (json as { results?: { DPA?: Record<string, unknown>; LPI?: Record<string, unknown> }[] })?.results ?? [];
  const out: PlaceHit[] = [];
  for (const r of rows) {
    const d = r.DPA ?? r.LPI;
    if (!d) continue;
    const lat = Number(d.LAT);
    const lng = Number(d.LNG);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ uprn: String(d.UPRN ?? ''), address: String(d.ADDRESS ?? ''), lat, lng });
  }
  return out;
}

/** Writes one row per call to pv_api_log. A logging failure never breaks the request. */
export async function logOsCall(endpoint: string, statusCode: number | null, campaignId?: string): Promise<void> {
  try {
    await supabaseAdmin().from('pv_api_log').insert({ provider: 'os_places', endpoint, campaign_id: campaignId ?? null, status_code: statusCode, est_cost: 0 });
  } catch (e) {
    console.error('[prospectpv] api log failed', e instanceof Error ? e.message : e);
  }
}

export type OsCheck = { name: string; ok: boolean; status: number | null; message: string };

/**
 * One-click diagnosis for the Map screen: does the OS key work for each thing the map uses? Each check is one small request.
 * Messages carry OS's own reason (bad key, or the API is not on the plan) and never the key.
 */
export async function checkOsConnection(f: Fetcher = fetch): Promise<OsCheck[]> {
  const key = process.env.OS_DATAHUB_KEY ?? process.env.PROSPECTPV_OS_API_KEY;
  if (!key) return [{ name: 'OS key', ok: false, status: null, message: 'OS_DATAHUB_KEY is not set on this deployment.' }];
  const run = async (name: string, url: URL, init?: RequestInit, bodyOk?: (j: unknown) => string | null): Promise<OsCheck> => {
    try {
      const res = await f(url, { ...init, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!res.ok) return { name, ok: false, status: res.status, message: detail(await res.text().catch(() => '')) || `HTTP ${res.status}` };
      if (bodyOk) {
        const problem = bodyOk(await res.json().catch(() => null));
        if (problem) return { name, ok: false, status: res.status, message: problem };
      }
      return { name, ok: true, status: res.status, message: 'Working.' };
    } catch {
      return { name, ok: false, status: null, message: 'No answer from OS.' };
    }
  };
  const places = new URL(`${OS_PLACES_BASE}/find`);
  places.searchParams.set('key', key); places.searchParams.set('query', 'SW1A 2AA'); places.searchParams.set('maxresults', '1');
  const poly = new URL(`${OS_PLACES_BASE}/polygon`);
  poly.searchParams.set('key', key); poly.searchParams.set('srs', 'EPSG:4326'); poly.searchParams.set('maxresults', '1'); poly.searchParams.set('fq', RESIDENTIAL_FQ);
  const area = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-0.1281, 51.5031], [-0.1261, 51.5031], [-0.1261, 51.5041], [-0.1281, 51.5041], [-0.1281, 51.5031]]] } };
  const tile = new URL('https://api.os.uk/maps/raster/v1/zxy/Light_3857/10/511/340.png');
  tile.searchParams.set('key', key);
  return Promise.all([
    run('Address search (OS Places)', places),
    run('Counting homes in an area (OS Places)', poly, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(area) }, (j) => (typeof (j as { header?: unknown })?.header === 'object' ? null : 'OS answered, but not in the expected shape.')),
    run('Map tiles (OS Maps)', tile),
  ]);
}
