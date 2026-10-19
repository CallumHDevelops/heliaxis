import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { makeDrive, placeEstimate, ukDate, type Drive, type LatLng, type Place } from './engine';
import type { BookingSettings } from './settings';

/**
 * Drive times for a search. Google Routes (computeRouteMatrix, TRAFFIC_UNAWARE) when
 * GOOGLE_MAPS_API_KEY is set, within a daily element budget; otherwise our own estimate (engine.ts).
 * Google durations live in memory for 10 minutes and are never stored in the database.
 */

export type Provider = {
  name: 'google' | 'estimate';
  /** Minutes, no rush-hour factor; null where there's no route. */
  matrix(origins: LatLng[], dests: LatLng[], o?: { signal?: AbortSignal }): Promise<(number | null)[][]>;
};

const ROUTES = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const MAX_ELEMENTS = 625;
const TTL = 10 * 60_000;
const memo = new Map<string, { at: number; mins: number | null }>();
let warned = false;

export const googleKey = () => process.env.GOOGLE_MAPS_API_KEY || '';
const llKey = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/**
 * Count `n` elements against today's budget (cms_kv 'google-routes-usage:YYYY-MM-DD'). False once the
 * day's allowance would be passed: the rest of the day uses the estimate. A compare-and-swap, so
 * searches running at the same time can't both count from the same total (only this writes the row).
 */
async function spend(n: number, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  try {
    const db = createAdminClient();
    const key = `google-routes-usage:${ukDate(Date.now())}`;
    for (let tries = 0; tries < 8; tries++) {
      const { data, error } = await db.from('cms_kv').select('value').eq('key', key).maybeSingle();
      if (error) return false;
      const used = Number(data?.value) || 0;
      if (used + n > limit) return false;
      const updated_at = new Date().toISOString();
      const r = data
        ? await db.from('cms_kv').update({ value: String(used + n), updated_at }).eq('key', key).eq('value', data.value).select('key')
        : await db.from('cms_kv').insert({ key, value: String(n), updated_at }).select('key'); // a racing first insert fails on the key
      if (!r.error && r.data?.length) return true;
      // Someone else counted first: read the total again.
    }
    return false; // too busy to count: use the estimate
  } catch {
    return false;
  }
}

/** Today's Google Routes use, for the settings screen. */
export async function googleUsageToday(): Promise<number> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', `google-routes-usage:${ukDate(Date.now())}`).maybeSingle();
    return Number(data?.value) || 0;
  } catch {
    return 0;
  }
}

type RouteElement = { originIndex?: number; destinationIndex?: number; duration?: string; condition?: string };

async function routesCall(origins: LatLng[], dests: LatLng[], signal?: AbortSignal): Promise<(number | null)[][]> {
  const wp = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
  const timeout = AbortSignal.timeout(6000);
  const r = await fetch(ROUTES, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleKey(),
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,condition',
    },
    body: JSON.stringify({ origins: origins.map(wp), destinations: dests.map(wp), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Google Routes returned ${r.status}`);
  const rows = (await r.json()) as RouteElement[];
  const out = origins.map(() => dests.map((): number | null => null));
  for (const e of Array.isArray(rows) ? rows : []) {
    const i = e.originIndex ?? 0; // zero can be left out
    const j = e.destinationIndex ?? 0;
    const secs = Number(String(e.duration || '').replace(/s$/, ''));
    if (out[i] && j < dests.length && e.condition === 'ROUTE_EXISTS' && Number.isFinite(secs)) out[i][j] = secs / 60;
  }
  return out;
}

function googleProvider(s: BookingSettings): Provider {
  return {
    name: 'google',
    async matrix(origins, dests, o = {}) {
      const out = origins.map(() => dests.map((): number | null => null));
      const now = Date.now();
      // Only ask for pairs not seen in the last 10 minutes.
      const todoO = new Set<number>();
      const todoD = new Set<number>();
      origins.forEach((a, i) =>
        dests.forEach((b, j) => {
          const hit = memo.get(`${llKey(a)}>${llKey(b)}`);
          if (hit && now - hit.at < TTL) out[i][j] = hit.mins;
          else {
            todoO.add(i);
            todoD.add(j);
          }
        })
      );
      const oi = [...todoO];
      const di = [...todoD];
      if (!oi.length) return out;
      // Chunk the longer side so origins × destinations ≤ 625 per call.
      const chunks: [number[], number[]][] = [];
      if (oi.length <= di.length) {
        const per = Math.max(1, Math.floor(MAX_ELEMENTS / oi.length));
        for (let k = 0; k < di.length; k += per) chunks.push([oi, di.slice(k, k + per)]);
      } else {
        const per = Math.max(1, Math.floor(MAX_ELEMENTS / di.length));
        for (let k = 0; k < oi.length; k += per) chunks.push([oi.slice(k, k + per), di]);
      }
      for (const [os, ds] of chunks) {
        if (!(await spend(os.length * ds.length, s.advanced.googleDailyElements))) throw new Error('Google Routes daily allowance used up');
        const m = await routesCall(
          os.map((i) => origins[i]),
          ds.map((j) => dests[j]),
          o.signal
        );
        os.forEach((i, a) =>
          ds.forEach((j, b) => {
            out[i][j] = m[a][b];
            memo.set(`${llKey(origins[i])}>${llKey(dests[j])}`, { at: Date.now(), mins: m[a][b] });
          })
        );
      }
      if (memo.size > 20_000) memo.clear();
      return out;
    },
  };
}

const estimateProvider: Provider = {
  name: 'estimate',
  // Never called for the estimate: buildDrive works from places (it needs their postcode areas).
  async matrix(origins, dests) {
    return origins.map(() => dests.map(() => null));
  },
};

/** Google when the key is set (and not switched to the estimate), else the estimate. */
export function pickProvider(s: BookingSettings): Provider {
  return s.advanced.travelProvider !== 'estimate' && googleKey() ? googleProvider(s) : estimateProvider;
}

/** Our estimate between two places (minutes, no rush hour). */
export function estimateBetween(a: Place, b: Place, s: BookingSettings): number | null {
  return placeEstimate(a, b, s.advanced);
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * The drive function for one search: the customer ↔ every distinct place in it (from Google, two
 * calls: to and from the customer), everything else our estimate × the median Google ÷ estimate
 * ratio of those legs.
 */
export async function buildDrive(
  s: BookingSettings,
  C: Place,
  places: Place[],
  o: { signal?: AbortSignal } = {}
): Promise<{ drive: Drive; provider: 'google' | 'estimate'; ratio: number }> {
  const est = (a: Place, b: Place) => estimateBetween(a, b, s);
  const provider = pickProvider(s);
  const toC = new Map<string, number | null>();
  const fromC = new Map<string, number | null>();
  let used: 'google' | 'estimate' = 'estimate';
  let ratio = 1;
  if (provider.name === 'google' && C.ll) {
    const distinct = new Map<string, Place>();
    for (const p of places) if (p.ll && !p.online && p !== C) distinct.set(llKey(p.ll), p);
    const list = [...distinct.values()];
    if (list.length) {
      try {
        const lls = list.map((p) => p.ll as LatLng);
        const [into, out] = [await provider.matrix(lls, [C.ll], o), await provider.matrix([C.ll], lls, o)];
        list.forEach((p, i) => {
          toC.set(llKey(p.ll as LatLng), into[i]?.[0] ?? null);
          fromC.set(llKey(p.ll as LatLng), out[0]?.[i] ?? null);
        });
        const ratios: number[] = [];
        list.forEach((p, i) => {
          const e = est(p, C);
          for (const g of [into[i]?.[0], out[0]?.[i]]) if (g != null && e && e > 0) ratios.push(g / e);
        });
        if (ratios.length) {
          used = 'google';
          ratio = Math.min(1.4, Math.max(0.7, median(ratios)));
        }
      } catch (e) {
        if (!warned) {
          warned = true;
          console.warn('Survey booking: Google Routes failed, using our estimate:', e instanceof Error ? e.message : e);
        }
      }
    }
  }
  const drive = makeDrive({
    customer: C,
    customerLeg: (other, toCustomer) => {
      if (!other.ll) return null;
      const v = (toCustomer ? toC : fromC).get(llKey(other.ll));
      return v === undefined ? null : v;
    },
    estimate: est,
    ratio,
    rushFactor: s.advanced.rushFactor,
    rushWindows: s.advanced.rushWindows,
  });
  return { drive, provider: used, ratio };
}
