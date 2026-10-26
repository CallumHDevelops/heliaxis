import 'server-only';
import { inside, type LngLat } from './overlay';

/**
 * The outline of the building at a point, from OpenStreetMap (free; the page credits it). The building the point is inside,
 * or failing that the nearest within a few metres. Null if there is none or the service is busy: the picture then has no outline.
 */
export async function buildingOutline(p: LngLat): Promise<LngLat[] | null> {
  const q = `[out:json][timeout:6];way(around:15,${p.lat.toFixed(6)},${p.lng.toFixed(6)})[building];out geom;`;
  // The free service is often busy, so two servers are asked at once and the first proper answer is used.
  const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const ask = async (url: string) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'heliaxis.co.uk solar estimator' },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`overpass ${r.status}`);
    return (await r.json()) as { elements?: { geometry?: { lat: number; lon: number }[] }[] };
  };
  try {
    const d = await Promise.any(servers.map(ask));
    const rings = (d.elements ?? []).map((e) => (e.geometry ?? []).map((g) => ({ lat: g.lat, lng: g.lon }))).filter((g) => g.length >= 4);
    if (!rings.length) return null;
    const containing = rings.find((ring) => inside(p, ring));
    if (containing) return containing;
    // Nearest by the closest corner.
    const dist = (ring: LngLat[]) => Math.min(...ring.map((g) => (g.lat - p.lat) ** 2 + ((g.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2));
    return rings.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  } catch {
    return null;
  }
}
