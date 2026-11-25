/**
 * Estimates a gable roof from a building outline (from OS data). Pure. The outline gives the size and direction of
 * the building; the roof shape and pitch are assumptions (a gable at the default pitch) unless a survey says
 * otherwise, and the result says so. It also pairs with the panel layout: `lengthM` and `slopeLengthM` are the roof
 * face's width along the eaves and length up the slope.
 */

export type LngLat = { lat: number; lng: number };
export type Pt = { x: number; y: number };

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Equirectangular metres around the outline's own middle: x east, y north. Fine over a building. */
export function ringToMetres(ring: LngLat[]): Pt[] {
  const pts = ring.length > 1 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng ? ring.slice(0, -1) : ring;
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lng0 = pts.reduce((a, p) => a + p.lng, 0) / pts.length;
  return pts.map((p) => ({ x: rad(p.lng - lng0) * R * Math.cos(rad(lat0)), y: rad(p.lat - lat0) * R }));
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return Math.abs(a) / 2;
}

/** The smallest rectangle round the outline (tried along every edge direction): its sides and the compass bearing of the long side (0 to 180). */
export function minAreaRect(pts: Pt[]) {
  let best: { area: number; length: number; width: number; bearing: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const th = Math.atan2(b.y - a.y, b.x - a.x);
    if (!Number.isFinite(th) || (a.x === b.x && a.y === b.y)) continue;
    const c = Math.cos(th);
    const s = Math.sin(th);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of pts) {
      const u = p.x * c + p.y * s;
      const v = -p.x * s + p.y * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const du = u1 - u0;
    const dv = v1 - v0;
    const area = du * dv;
    if (!best || area < best.area - 1e-9) {
      // Direction of the long side as a compass bearing: (east, north) = (cos th, sin th) for du, or the perpendicular for dv.
      const longAlong = du >= dv ? th : th + Math.PI / 2;
      const bearing = ((90 - deg(longAlong)) % 180 + 180) % 180;
      best = { area, length: Math.max(du, dv), width: Math.min(du, dv), bearing };
    }
  }
  if (!best) throw new Error('The outline has no usable edges.');
  return best;
}

export type RoofEstimate = {
  /** Roof face width along the eaves (the building's long side), metres. */
  lengthM: number;
  /** The building's short side: the gable's span, metres. */
  depthM: number;
  /** Roof face length up the slope, metres, for the assumed pitch. */
  slopeLengthM: number;
  pitchDeg: number;
  /** Compass bearing of the ridge (0 to 180). */
  ridgeBearingDeg: number;
  /** The compass bearing the better-lit slope looks toward (nearest south). */
  faceAzimuthDeg: number;
  footprintAreaM2: number;
  /** How much of its bounding rectangle the outline fills (1 = a plain rectangle). */
  rectangularity: number;
  warnings: string[];
};

export const DEFAULT_PITCH = 35;

export function roofFromFootprint(ring: LngLat[], pitchDeg = DEFAULT_PITCH): RoofEstimate {
  const pts = ringToMetres(ring);
  if (pts.length < 3) throw new Error('The outline has too few points.');
  const rect = minAreaRect(pts);
  const area = polygonArea(pts);
  const rectangularity = rect.area > 0 ? Math.min(1, area / rect.area) : 0;
  const beta = rect.bearing;
  const a = (beta + 90) % 360;
  const b = (beta + 270) % 360;
  const away = (x: number) => Math.abs(((x - 180 + 540) % 360) - 180);
  const faceAzimuthDeg = away(a) <= away(b) ? a : b;
  const slopeLengthM = rect.width / 2 / Math.cos(rad(pitchDeg));
  const warnings: string[] = [`Roof shape (gable) and pitch (${pitchDeg}°) are assumed, not surveyed.`];
  if (rectangularity < 0.85) warnings.push('The outline is not a plain rectangle (an extension, an L-shape or a terrace?), so these sizes are of the smallest rectangle round it and may be too big.');
  if (rect.length / rect.width > 3.2) warnings.push('The outline is very long and thin: it may be a terrace or a row of buildings rather than one house.');
  return { lengthM: round1(rect.length), depthM: round1(rect.width), slopeLengthM: round1(slopeLengthM), pitchDeg, ridgeBearingDeg: Math.round(beta), faceAzimuthDeg: Math.round(faceAzimuthDeg), footprintAreaM2: Math.round(area), rectangularity: Math.round(rectangularity * 100) / 100, warnings };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
