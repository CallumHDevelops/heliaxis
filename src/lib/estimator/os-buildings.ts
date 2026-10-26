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

/** The nearest of some rings: the one the point is inside, else the one with the closest corner. */
function pick(rings: LngLat[][], p: LngLat): LngLat[] | null {
  if (!rings.length) return null;
  const containing = rings.find((ring) => inside(p, ring));
  if (containing) return containing;
  const dist = (ring: LngLat[]) => Math.min(...ring.map((g) => (g.lat - p.lat) ** 2 + ((g.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2));
  return rings.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}

/**
 * Individual buildings from OS's NGD Buildings (premium data: it splits terraces at the party walls, so one house is one outline).
 * Needs the Premium plan; null when the plan, layer or area is not available, and the free outline is used instead.
 */
async function ngdOutline(p: LngLat, key: string): Promise<LngLat[] | null> {
  const d = 0.0002;
  const u = new URL(`https://api.os.uk/features/ngd/ofa/v1/collections/${process.env.OS_NGD_LAYER || 'bld-fts-buildingpart'}/items`);
  u.searchParams.set('key', key);
  u.searchParams.set('bbox', `${p.lng - d},${p.lat - d},${p.lng + d},${p.lat + d}`);
  u.searchParams.set('limit', '20');
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { features?: { geometry?: { type?: string; coordinates?: unknown } }[] };
    const rings: LngLat[][] = [];
    for (const f of j.features ?? []) {
      const g = f.geometry;
      const polys = g?.type === 'Polygon' ? [g.coordinates as number[][][]] : g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [];
      for (const poly of polys) if (poly?.[0]?.length >= 4) rings.push(poly[0].map(([lng, lat]) => ({ lat, lng })));
    }
    // Only trust a ring that actually contains the point: a near miss could be the neighbour.
    return rings.find((ring) => inside(p, ring)) ?? null;
  } catch {
    return null;
  }
}

export async function osBuildingOutline(p: LngLat): Promise<LngLat[] | null> {
  const key = process.env.OS_DATAHUB_KEY;
  if (!key) return null;
  const detailed = await ngdOutline(p, key);
  if (detailed) return detailed;
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
    return pick(rings, p);
  } catch {
    return null;
  }
}
