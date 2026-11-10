/**
 * A drawn area: validation and measuring. Pure, no I/O.
 *
 * The map draws in WGS84 (longitude, latitude). The checks here stop obvious
 * problems before anything is sent (open ring, bow-tie shape, too big), and give
 * a plain message for each. The database measures the area again in British
 * National Grid and enforces the limit, so this is a courtesy, not the guard.
 */

export type Position = [number, number];
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

export type AreaLimits = {
  max_area_ha: number | null;
  max_shapes: number;
  max_vertices: number;
};

export const DEFAULT_LIMITS: AreaLimits = { max_area_ha: null, max_shapes: 5, max_vertices: 500 };

export type AreaProblem =
  | 'empty'
  | 'not_polygon'
  | 'bad_coordinates'
  | 'outside_coverage'
  | 'open_ring'
  | 'too_few_points'
  | 'has_hole'
  | 'self_crossing'
  | 'zero_area'
  | 'too_many_shapes'
  | 'too_many_points'
  | 'too_large';

export type AreaCheck =
  | { ok: true; geometry: MultiPolygonGeometry; areaHa: number; shapes: number; vertices: number }
  | { ok: false; problem: AreaProblem; message: string };

/** Rough box around Great Britain: OS Places has no data outside it. */
export const GB_BOX = { minLng: -9, maxLng: 2.5, minLat: 49.5, maxLat: 61 } as const;

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Area of a ring on a sphere (square metres). Orientation does not matter. */
export function ringAreaM2(ring: Position[]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i]!;
    const [lng2, lat2] = ring[i + 1]!;
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export const areaHectares = (ring: Position[]) => ringAreaM2(ring) / 10_000;

const fail = (problem: AreaProblem, message: string): AreaCheck => ({ ok: false, problem, message });

const isPosition = (p: unknown): p is Position =>
  Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Orientation of c relative to the line a→b: >0 left, <0 right, 0 on the line. */
const cross = (a: Position, b: Position, c: Position) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Position, b: Position, c: Position) =>
  Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);

function segmentsIntersect(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

/** True if any two edges of the ring that are not neighbours cross or touch. */
export function ringSelfIntersects(ring: Position[]): boolean {
  const n = ring.length - 1; // last point repeats the first
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a point by design; the first and last edge are neighbours too.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!)) return true;
    }
  }
  return false;
}

const sameLngLat = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** Checks a drawn area and returns it as a MultiPolygon with its size. */
export function validateDrawnArea(input: unknown, limits: AreaLimits = DEFAULT_LIMITS): AreaCheck {
  if (!input || typeof input !== 'object') return fail('empty', 'Draw an area on the map first.');
  const g = input as { type?: unknown; coordinates?: unknown };
  let polygons: Position[][][];
  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) polygons = [g.coordinates as Position[][]];
  else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) polygons = g.coordinates as Position[][][];
  else return fail('not_polygon', 'The area must be a polygon.');

  if (polygons.length === 0) return fail('empty', 'Draw an area on the map first.');
  if (polygons.length > limits.max_shapes) {
    return fail('too_many_shapes', `Use at most ${limits.max_shapes} shapes in one area. You have ${polygons.length}.`);
  }

  let vertices = 0;
  let areaHa = 0;
  const out: Position[][][] = [];

  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length === 0) return fail('empty', 'One of the shapes is empty.');
    if (poly.length > 1) return fail('has_hole', 'Shapes with holes aren’t supported. Draw separate shapes instead.');
    const ring = poly[0]!;
    if (!Array.isArray(ring) || !ring.every(isPosition)) return fail('bad_coordinates', 'The area has coordinates that can’t be read.');
    if (ring.length < 4) return fail('too_few_points', 'A shape needs at least three corners.');
    if (!sameLngLat(ring[0]!, ring[ring.length - 1]!)) return fail('open_ring', 'The shape isn’t closed. Finish it by joining it back to its first corner.');
    const clean = ring.map((p) => [p[0], p[1]] as Position);
    if (clean.some(([lng, lat]) => lng < GB_BOX.minLng || lng > GB_BOX.maxLng || lat < GB_BOX.minLat || lat > GB_BOX.maxLat)) {
      return fail('outside_coverage', 'The area is outside Great Britain. Move it over the homes you want to write to.');
    }
    vertices += clean.length - 1;
    if (vertices > limits.max_vertices) {
      return fail('too_many_points', `The shape has too many corners (the limit is ${limits.max_vertices}). Simplify it or draw it more roughly.`);
    }
    if (ringSelfIntersects(clean)) return fail('self_crossing', 'The shape crosses over itself. Edit the corners so the outline doesn’t cross.');
    const ha = areaHectares(clean);
    // Below 1 m² is a line, or rounding noise on one (a flat ring isn't exactly zero in floating point).
    if (!(ha > 0.0001)) return fail('zero_area', 'The shape has no area. Drag the corners apart.');
    areaHa += ha;
    out.push([clean]);
  }

  if (limits.max_area_ha !== null && areaHa > limits.max_area_ha) {
    return fail('too_large', `The area is ${formatHa(areaHa)}; the limit is ${formatHa(limits.max_area_ha)}. Draw a smaller area.`);
  }
  return { ok: true, geometry: { type: 'MultiPolygon', coordinates: out }, areaHa, shapes: out.length, vertices };
}

export const formatHa = (ha: number) => `${ha >= 100 ? Math.round(ha) : ha >= 10 ? ha.toFixed(1) : ha.toFixed(2)} ha`;

/** Reads the limits out of the `map` settings row, ignoring anything that isn't a sensible number. */
export function limitsFromSettings(raw: unknown): AreaLimits {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  return {
    max_area_ha: pos(o.max_area_ha),
    max_shapes: Math.floor(pos(o.max_shapes) ?? DEFAULT_LIMITS.max_shapes),
    max_vertices: Math.floor(pos(o.max_vertices) ?? DEFAULT_LIMITS.max_vertices),
  };
}

/** Pulls a single geometry out of an uploaded GeoJSON file (geometry, Feature or FeatureCollection). */
export function geometryFromGeoJson(parsed: unknown): unknown {
  const o = parsed as { type?: string; geometry?: unknown; features?: unknown[] } | null;
  if (!o || typeof o !== 'object') return null;
  if (o.type === 'Polygon' || o.type === 'MultiPolygon') return o;
  if (o.type === 'Feature') return o.geometry ?? null;
  if (o.type === 'FeatureCollection' && Array.isArray(o.features)) {
    const polys: Position[][][] = [];
    for (const f of o.features) {
      const geom = (f as { geometry?: { type?: string; coordinates?: unknown } } | null)?.geometry;
      if (geom?.type === 'Polygon') polys.push(geom.coordinates as Position[][]);
      else if (geom?.type === 'MultiPolygon') polys.push(...(geom.coordinates as Position[][][]));
    }
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }
  return null;
}

/** A square of about `sideM` metres centred on a point, for drawing without a mouse. */
export function squareAround(lng: number, lat: number, sideM = 200): PolygonGeometry {
  const half = sideM / 2;
  const dLat = (half / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos(rad(lat));
  const r = (n: number) => Math.round(n * 1e7) / 1e7;
  const ring: Position[] = [
    [r(lng - dLng), r(lat - dLat)], [r(lng + dLng), r(lat - dLat)], [r(lng + dLng), r(lat + dLat)], [r(lng - dLng), r(lat + dLat)], [r(lng - dLng), r(lat - dLat)],
  ];
  return { type: 'Polygon', coordinates: [ring] };
}
