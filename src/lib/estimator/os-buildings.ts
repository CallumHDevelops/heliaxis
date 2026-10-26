import 'server-only';
import { inside, type LngLat } from './overlay';

/**
 * The outline of the building at a point from Ordnance Survey's OS Features API (building polygons, free OpenData plan; the
 * page credits OS). Needs OS_DATAHUB_KEY. Null when there is no key, no building or the service is busy, and the caller then
 * tries OpenStreetMap. Asked in Web Mercator metres (x, y), which has no axis-order ambiguity.
 */
const R = 6378137;
const toMerc = (p: LngLat) => ({ x: (p.lng * Math.PI * R) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + (p.lat * Math.PI) / 360)) });
const fromMerc = (x: number, y: number): LngLat => ({ lng: (x / R) * (180 / Math.PI), lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI) });

export async function osBuildingOutline(p: LngLat): Promise<LngLat[] | null> {
  const key = process.env.OS_DATAHUB_KEY;
  if (!key) return null;
  const c = toMerc(p);
  const pad = 25;
  const u = new URL('https://api.os.uk/features/v1/wfs');
  u.searchParams.set('key', key);
  u.searchParams.set('service', 'WFS');
  u.searchParams.set('version', '2.0.0');
  u.searchParams.set('request', 'GetFeature');
  u.searchParams.set('typeNames', process.env.OS_BUILDINGS_LAYER || 'Zoomstack_LocalBuildings');
  u.searchParams.set('outputFormat', 'GEOJSON');
  u.searchParams.set('srsName', 'EPSG:3857');
  u.searchParams.set('bbox', `${c.x - pad},${c.y - pad},${c.x + pad},${c.y + pad},EPSG:3857`);
  u.searchParams.set('count', '40');
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { features?: { geometry?: { type?: string; coordinates?: unknown } }[] };
    const rings: LngLat[][] = [];
    for (const f of d.features ?? []) {
      const g = f.geometry;
      const polys = g?.type === 'Polygon' ? [g.coordinates as number[][][]] : g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [];
      for (const poly of polys) if (poly?.[0]?.length >= 4) rings.push(poly[0].map(([x, y]) => fromMerc(x, y)));
    }
    if (!rings.length) return null;
    const containing = rings.find((ring) => inside(p, ring));
    if (containing) return containing;
    const dist = (ring: LngLat[]) => Math.min(...ring.map((g) => (g.lat - p.lat) ** 2 + ((g.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2));
    return rings.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  } catch {
    return null;
  }
}
