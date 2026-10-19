import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CalEvent } from '@/lib/ms365';
import { haversineKm, type LatLng, type Place } from './engine';

/**
 * Where things are, for drive times: postcodes.io (OS OpenData, no key). Unlike
 * geocode-postcode.ts it never quietly falls back to the area centre: a full postcode is found or
 * it isn't, and outcode lookups are asked for explicitly. Postcodes don't move, so results are kept
 * in geo_cache ('pc:NP204AB', 'oc:NP20', 'place:cwmbran') as well as in memory.
 */

const API = 'https://api.postcodes.io';
const FULL = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const OUT = /^[A-Z]{1,2}\d[A-Z\d]?$/;
/** A postcode inside free text. */
export const POSTCODE_IN_TEXT = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
/** An outward code on its own, for the areas we work in. */
const OUTCODE_IN_TEXT = /\b(?:NP|CF|SA|LD|HR|GL|BS|BA)\d{1,2}\b/i;
const ONLINE = /teams|zoom|meet\.google|webex/i;
/** Our own postcodes (office, home) turn up in email signatures, so the body never counts them. */
const OWN_POSTCODES = ['NP197AZ', 'NP265ST'];

export type GeoHit = {
  ll: LatLng;
  quality: number;
  exact: true;
  /** "NP20 4AB" */
  postcode: string;
  outcode: string;
  town: string;
  /** The postcode has no grid reference (quality 9), so this is the outcode's centre. */
  approx?: boolean;
};
export type GeoMiss = { error: 'not_found' | 'ni' | 'invalid' | 'unavailable' };
export type GeoResult = GeoHit | GeoMiss;
export const isHit = (r: GeoResult | null | undefined): r is GeoHit => !!r && 'll' in r;

/** "np20 4ab" → "NP204AB" (null unless it's a whole UK postcode). */
export function normPostcode(pc: string | null | undefined): string | null {
  const k = String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return FULL.test(k) ? k : null;
}
export const spacedPostcode = (k: string) => `${k.slice(0, -3)} ${k.slice(-3)}`;
export const outcodeOf = (pc: string | null | undefined): string => {
  const k = String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return FULL.test(k) ? k.slice(0, -3) : OUT.test(k) ? k : '';
};

type Cached = { lat: number; lng: number; quality: number | null; town: string | null };
const memory = new Map<string, Cached | null>();
const MEMORY_MAX = 5000;

function remember(key: string, v: Cached | null) {
  if (memory.size > MEMORY_MAX) memory.clear();
  memory.set(key, v);
}

async function readCache(keys: string[]): Promise<void> {
  const missing = keys.filter((k) => !memory.has(k));
  if (!missing.length) return;
  try {
    for (let i = 0; i < missing.length; i += 100) {
      const { data } = await createAdminClient()
        .from('geo_cache')
        .select('key, lat, lng, quality, town')
        .in('key', missing.slice(i, i + 100));
      for (const r of data ?? []) remember(r.key as string, { lat: r.lat, lng: r.lng, quality: r.quality, town: r.town });
    }
  } catch {
    // No geo_cache table yet: postcodes.io every time (still kept in memory).
  }
}

async function writeCache(rows: { key: string; lat: number; lng: number; quality: number | null; town: string | null }[]) {
  if (!rows.length) return;
  try {
    await createAdminClient()
      .from('geo_cache')
      .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  } catch {
    // Only a cache.
  }
}

async function get(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> | null }> {
  try {
    const r = await fetch(`${API}${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : '');

type PcResult = { latitude?: number | null; longitude?: number | null; quality?: number; admin_district?: unknown; parish?: unknown; postcode?: string };
function townOf(r: PcResult): string {
  return str(r.admin_district) || str(r.parish) || '';
}

function hitFrom(k: string, c: Cached, approx = false): GeoHit {
  return {
    ll: { lat: c.lat, lng: c.lng },
    quality: c.quality ?? 1,
    exact: true,
    postcode: spacedPostcode(k),
    outcode: k.slice(0, -3),
    town: c.town || '',
    ...(approx ? { approx: true } : {}),
  };
}

/** An outcode's centre ('NP20'). Null if it isn't one. */
export async function lookupOutcode(oc: string): Promise<{ ll: LatLng; town: string } | null> {
  const k = oc.toUpperCase().replace(/\s+/g, '');
  if (!OUT.test(k)) return null;
  const key = `oc:${k}`;
  await readCache([key]);
  const known = memory.get(key);
  if (known !== undefined) return known ? { ll: { lat: known.lat, lng: known.lng }, town: known.town || '' } : null;
  const { status, body } = await get(`/outcodes/${encodeURIComponent(k)}`);
  const r = body?.result as PcResult | undefined;
  if (status === 200 && r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
    const c = { lat: r.latitude, lng: r.longitude, quality: null, town: townOf(r) };
    remember(key, c);
    await writeCache([{ key, ...c }]);
    return { ll: { lat: c.lat, lng: c.lng }, town: c.town };
  }
  if (status === 404) remember(key, null);
  return null;
}

async function fromResult(k: string, r: PcResult): Promise<GeoResult> {
  const quality = typeof r.quality === 'number' ? r.quality : 1;
  if (typeof r.latitude === 'number' && typeof r.longitude === 'number' && quality < 9) {
    const c = { lat: r.latitude, lng: r.longitude, quality, town: townOf(r) };
    remember(`pc:${k}`, c);
    await writeCache([{ key: `pc:${k}`, ...c }]);
    return hitFrom(k, c);
  }
  // No grid reference (quality 9): use the outcode's centre, and say so.
  const oc = await lookupOutcode(k.slice(0, -3));
  if (!oc) return { error: 'not_found' };
  const c = { lat: oc.ll.lat, lng: oc.ll.lng, quality: 9, town: townOf(r) || oc.town };
  remember(`pc:${k}`, c);
  await writeCache([{ key: `pc:${k}`, ...c }]);
  return hitFrom(k, c, true);
}

/** A full UK postcode → its coordinates. Northern Ireland (BT) isn't covered. Never throws. */
export async function lookupPostcode(pc: string | null | undefined): Promise<GeoResult> {
  const k = normPostcode(pc);
  if (!k) return { error: 'invalid' };
  if (k.startsWith('BT')) return { error: 'ni' };
  const key = `pc:${k}`;
  await readCache([key]);
  const known = memory.get(key);
  if (known) return hitFrom(k, known, known.quality === 9);
  if (known === null) return { error: 'not_found' };
  const { status, body } = await get(`/postcodes/${k}`);
  if (status === 200 && body?.result) return fromResult(k, body.result as PcResult);
  if (status === 404) {
    // Recently retired postcodes still have a location.
    const t = await get(`/terminated_postcodes/${k}`);
    if (t.status === 200 && t.body?.result) return fromResult(k, t.body.result as PcResult);
    remember(key, null);
    return { error: 'not_found' };
  }
  return { error: 'unavailable' };
}

/** Look up many postcodes in one go (postcodes.io takes 100 per request), filling the caches. */
export async function prefetchPostcodes(list: (string | null | undefined)[]): Promise<void> {
  const keys = [...new Set(list.map(normPostcode).filter((k): k is string => !!k && !k.startsWith('BT')))];
  if (!keys.length) return;
  await readCache(keys.map((k) => `pc:${k}`));
  const todo = keys.filter((k) => !memory.has(`pc:${k}`));
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const { status, body } = await get('/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: chunk }),
    });
    if (status !== 200 || !Array.isArray(body?.result)) return;
    const rows: { key: string; lat: number; lng: number; quality: number | null; town: string | null }[] = [];
    for (const x of body.result as { query?: string; result?: PcResult | null }[]) {
      const k = normPostcode(x.query);
      const r = x.result;
      if (!k || !r) continue; // not found: lookupPostcode tries it (and retired postcodes) one by one
      const quality = typeof r.quality === 'number' ? r.quality : 1;
      if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number' || quality >= 9) continue;
      const c = { lat: r.latitude, lng: r.longitude, quality, town: townOf(r) };
      remember(`pc:${k}`, c);
      rows.push({ key: `pc:${k}`, ...c });
    }
    await writeCache(rows);
  }
}

/** A town or village name → its centre (postcodes.io /places). Null if nothing matches. */
export async function lookupPlace(name: string): Promise<{ ll: LatLng; town: string } | null> {
  const q = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2 || q.length > 40 || /\d/.test(q)) return null;
  const key = `place:${q}`;
  await readCache([key]);
  const known = memory.get(key);
  if (known !== undefined) return known ? { ll: { lat: known.lat, lng: known.lng }, town: known.town || name } : null;
  const { status, body } = await get(`/places?q=${encodeURIComponent(q)}&limit=1`);
  const r = Array.isArray(body?.result) ? (body.result[0] as { latitude?: number; longitude?: number; name_1?: string } | undefined) : undefined;
  if (status === 200 && r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
    const c = { lat: r.latitude, lng: r.longitude, quality: null, town: r.name_1 || name };
    remember(key, c);
    await writeCache([{ key, ...c }]);
    return { ll: { lat: c.lat, lng: c.lng }, town: c.town };
  }
  if (status === 200) remember(key, null);
  return null;
}

/** An engine Place for a postcode result. */
export function placeFromHit(hit: GeoHit, label?: string): Place {
  return {
    ll: hit.ll,
    label: label ?? [hit.town, hit.outcode].filter(Boolean).join(' '),
    outcode: hit.outcode,
    pc: hit.postcode.replace(/\s+/g, ''),
  };
}

/** A place from stored coordinates and a postcode (bookings, jobs, diary entries), geocoding the postcode if needed. */
export async function placeFromStored(o: {
  lat?: number | null;
  lng?: number | null;
  postcode?: string | null;
  label?: string;
}): Promise<(Place & { approx?: boolean }) | null> {
  const k = normPostcode(o.postcode);
  if (typeof o.lat === 'number' && typeof o.lng === 'number') {
    return { ll: { lat: o.lat, lng: o.lng }, label: o.label ?? (k ? k.slice(0, -3) : ''), outcode: k ? k.slice(0, -3) : undefined, pc: k ?? undefined };
  }
  if (k) {
    const hit = await lookupPostcode(k);
    if (isHit(hit)) return { ...placeFromHit(hit, o.label), ...(hit.approx ? { approx: true } : {}) };
    const oc = await lookupOutcode(k.slice(0, -3));
    if (oc) return { ll: oc.ll, label: o.label ?? k.slice(0, -3), outcode: k.slice(0, -3), approx: true };
  }
  // Only an area (or a postcode we couldn't find): its centre, marked as approximate.
  const oc = outcodeOf(o.postcode);
  if (oc) {
    const c = await lookupOutcode(oc);
    if (c) return { ll: c.ll, label: o.label ?? oc, outcode: oc, approx: true };
  }
  return null;
}

const STOP_WORDS = /^(office|tbc|tba|tbd|n\/?a|none|various|phone|call|online|video|car|van|site|on site|customer|client|lunch|break)$/i;
const HOME_WORDS = /^(home|at home|house|my house)$/i;

/**
 * Where an Outlook appointment is, trying in order: the address's postcode, a postcode in the
 * location name, the location's coordinates, a postcode in the subject, an outward code alone,
 * online (carried forward by the engine), a town name (within 120 km of home), a postcode in the
 * body (never for private events; our own postcodes ignored), else unknown (treated as home).
 */
export async function resolvePlace(ev: CalEvent, base: Place): Promise<Place> {
  const priv = ev.sensitivity === 'private' || ev.sensitivity === 'confidential';
  const name = (ev.location?.displayName || '').trim();
  const subject = ev.subject || '';
  const label = (p: Place) => (priv ? { ...p, label: p.outcode || '' } : p);
  const tryPostcode = async (text: string | undefined | null, ignoreOwn = false): Promise<Place | null> => {
    if (!text) return null;
    // The first postcode in the text (in the body, the first that isn't one of ours).
    for (const m of text.matchAll(new RegExp(POSTCODE_IN_TEXT.source, 'gi'))) {
      const k = normPostcode(`${m[1]}${m[2]}`);
      if (!k || (ignoreOwn && OWN_POSTCODES.includes(k))) continue;
      const hit = await lookupPostcode(k);
      return isHit(hit) ? label(placeFromHit(hit)) : null;
    }
    return null;
  };

  const viaAddress = await tryPostcode(ev.location?.postalCode);
  if (viaAddress) return viaAddress;
  const viaName = await tryPostcode(name);
  if (viaName) return viaName;
  if (typeof ev.location?.lat === 'number' && typeof ev.location?.lng === 'number') {
    return { ll: { lat: ev.location.lat, lng: ev.location.lng }, label: priv ? '' : name || ev.location.city || '' };
  }
  const viaSubject = await tryPostcode(subject);
  if (viaSubject) return viaSubject;
  const oc = OUTCODE_IN_TEXT.exec(name) ?? OUTCODE_IN_TEXT.exec(subject);
  if (oc) {
    const c = await lookupOutcode(oc[0]);
    if (c) return { ll: c.ll, label: priv ? oc[0].toUpperCase() : `${c.town} ${oc[0].toUpperCase()}`.trim(), outcode: oc[0].toUpperCase() };
  }
  if (ev.isOnlineMeeting || ONLINE.test(name) || ONLINE.test(subject)) return { ll: null, label: 'Online', online: true };
  if (HOME_WORDS.test(name)) return { ...base, label: base.label };
  if (name && !STOP_WORDS.test(name) && name.length >= 2 && name.length <= 40 && !/\d/.test(name) && base.ll) {
    const town = await lookupPlace(name);
    if (town && haversineKm(town.ll, base.ll) <= 120) return { ll: town.ll, label: priv ? '' : town.town };
  }
  if (!priv) {
    const viaBody = await tryPostcode(ev.bodyPreview, true);
    if (viaBody) return viaBody;
  }
  return { ...base, label: 'No location', unknown: true, home: false };
}
