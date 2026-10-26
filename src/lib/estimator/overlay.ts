/**
 * Drawing the roof on the satellite picture. Pure maths, so the alignment can be tested without Google.
 *
 * The picture is a Google static map: Web Mercator, north up, centred on the building, `zoom`, 640 x 640 "map pixels"
 * (delivered at twice that size for sharpness). An SVG with viewBox 0 0 640 640 laid over it uses the same pixels.
 */

export const MAP_SIZE = 640;
export const MAP_ZOOM = 20;

export type LngLat = { lat: number; lng: number };
export type Pt = { x: number; y: number };

/** Metres one map pixel covers at a latitude and zoom (256-pixel tiles). */
export const metresPerPixel = (lat: number, zoom = MAP_ZOOM) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);

/** World pixel of a coordinate at a zoom (Web Mercator, 256-pixel tiles). */
function world(p: LngLat, zoom: number): Pt {
  const scale = 256 * Math.pow(2, zoom);
  const siny = Math.min(Math.max(Math.sin((p.lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: ((p.lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale };
}

/** Where a coordinate falls in the picture centred on `centre`. */
export function toPixel(p: LngLat, centre: LngLat, zoom = MAP_ZOOM, size = MAP_SIZE): Pt {
  const a = world(p, zoom);
  const c = world(centre, zoom);
  return { x: size / 2 + (a.x - c.x), y: size / 2 + (a.y - c.y) };
}

export type PanelSpec = { lat: number; lng: number; orientation: 'portrait' | 'landscape'; azimuth: number; /** Roof pitch in degrees: seen from above a panel is shorter along the slope by its cosine. */ pitch?: number };

/**
 * The four corners of a panel in picture pixels. `azimuth` is the compass direction its roof face looks (180 = south), which
 * is the downslope direction: a portrait panel's long side runs along the slope. `widthM`/`heightM` are the panel's short and
 * long sides (Google reports 1.045 x 1.879 for a 400 W panel).
 */
export function panelPolygon(p: PanelSpec, widthM: number, heightM: number, centre: LngLat, zoom = MAP_ZOOM, size = MAP_SIZE): Pt[] {
  const c = toPixel(p, centre, zoom, size);
  const mpp = metresPerPixel(p.lat, zoom);
  const az = (p.azimuth * Math.PI) / 180;
  // Unit vectors in picture pixels (x right = east, y down = south): down the slope, and across it.
  const down = { x: Math.sin(az), y: -Math.cos(az) };
  const across = { x: Math.cos(az), y: Math.sin(az) };
  const [slopeLen, side] = p.orientation === 'portrait' ? [heightM, widthM] : [widthM, heightM];
  const along = slopeLen * Math.cos(((p.pitch ?? 0) * Math.PI) / 180);
  const hl = along / 2 / mpp;
  const hs = side / 2 / mpp;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, s]) => ({ x: c.x + a * hl * down.x + s * hs * across.x, y: c.y + a * hl * down.y + s * hs * across.y }));
}

export const pointsAttr = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** Is the point inside the polygon (lat/lng ring)? Used to pick the building the address is in. */
export function inside(p: LngLat, ring: LngLat[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) hit = !hit;
  }
  return hit;
}
