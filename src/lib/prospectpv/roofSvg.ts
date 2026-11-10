/**
 * Roof graphic from the OS NGD footprint (spec 6.3): plan view, north up,
 * with an indicative panel layout on the side of the roof facing the main
 * aspect. Never uses Google imagery.
 *
 * Output is in a fixed 300 × 200 viewBox so every template can place it the
 * same way. Styling is left to the templates via class names:
 *   path.pv-roof-outline   (from footprintSvgPath)
 *   line.pv-roof-ridge
 *   polygon.pv-roof-panel
 */

export const ROOF_VIEWBOX = { width: 300, height: 200 } as const;

/** Drawing area inside the viewBox; the right margin leaves room for the north arrow. */
const FRAME = { x0: 22, y0: 16, x1: 266, y1: 184 };

export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export const COMPASS_NAMES: Record<Compass, string> = {
  N: 'North', NE: 'North-east', E: 'East', SE: 'South-east',
  S: 'South', SW: 'South-west', W: 'West', NW: 'North-west',
};
const COMPASS_VECTORS: Record<Compass, [number, number]> = {
  N: [0, 1], NE: [Math.SQRT1_2, Math.SQRT1_2], E: [1, 0], SE: [Math.SQRT1_2, -Math.SQRT1_2],
  S: [0, -1], SW: [-Math.SQRT1_2, -Math.SQRT1_2], W: [-1, 0], NW: [-Math.SQRT1_2, Math.SQRT1_2],
};

type Pt = [number, number];
type Ring = Pt[];
type Polygon = Ring[]; // outer ring first, then holes (GeoJSON order)

export type RoofPlanInput = {
  /** GeoJSON Polygon or MultiPolygon `coordinates`. */
  coordinates: Polygon | Polygon[];
  /** OS NGD returns British National Grid metres; WGS84 is accepted too. */
  crs: 'EPSG:27700' | 'EPSG:4326';
  mainAspect: Compass;
  panelCount: number;
  /** OS roof shape. "Flat" gets no ridge and panels across the whole roof. */
  roofShape?: string | null;
  /** Plan-view panel size in metres (portrait panel, ~35° pitch). */
  panel?: { alongRidgeM: number; upSlopeM: number; gapM: number; edgeMarginM: number; ridgeMarginM: number };
};

export type RoofPlan = {
  footprintSvgPath: string;
  panelAreaSvg: string;
  panelsDrawn: number;
  /** True if fewer panels than requested could be drawn (layout is indicative anyway). */
  truncated: boolean;
};

const DEFAULT_PANEL = { alongRidgeM: 1.13, upSlopeM: 1.44, gapM: 0.03, edgeMarginM: 0.3, ridgeMarginM: 0.25 };

// ---------------------------------------------------------------------------

const isMulti = (c: Polygon | Polygon[]): c is Polygon[] => Array.isArray(c[0]?.[0]?.[0]);

function toMetres(polys: Polygon[], crs: RoofPlanInput['crs']): Polygon[] {
  if (crs === 'EPSG:27700') return polys;
  // Local equirectangular projection: accurate to a few cm over one building.
  const first = polys[0]![0]![0]!;
  const [lon0, lat0] = first;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  return polys.map((p) => p.map((r) => r.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky] as Pt)));
}

const rotate = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0] + r[i]![0]) * (r[j]![1] - r[i]![1]);
  return Math.abs(a / 2);
}

function pointInPolygon([x, y]: Pt, poly: Polygon): boolean {
  let inside = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function bbox(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Orientation of the minimum-area bounding rectangle (rotating calipers over edge angles). */
function principalAngle(ring: Ring): number {
  let best = 0;
  let bestArea = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    if (Math.hypot(x2 - x1, y2 - y1) < 0.5) continue;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const b = bbox(ring.map((p) => rotate(p, -a)));
    const area = b.w * b.h;
    if (area < bestArea - 1e-9) { bestArea = area; best = a; }
  }
  return best;
}

type Rect = { x: number; y: number; w: number; h: number };
const corners = (r: Rect): Pt[] => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

/** Rect (inflated by margin) lies inside the polygon: corners and edge midpoints. */
function rectFits(r: Rect, poly: Polygon, margin: number): boolean {
  const g: Rect = { x: r.x - margin, y: r.y - margin, w: r.w + 2 * margin, h: r.h + 2 * margin };
  const pts: Pt[] = [...corners(g), [g.x + g.w / 2, g.y], [g.x + g.w, g.y + g.h / 2], [g.x + g.w / 2, g.y + g.h], [g.x, g.y + g.h / 2]];
  return pts.every((p) => pointInPolygon(p, poly));
}

/**
 * Lays out panel slots in one half of the roof (in the building-aligned frame,
 * ridge horizontal). `side` +1 = above the ridge, -1 = below, 0 = whole roof.
 * Returns rows ordered from the eaves inward.
 */
function layoutSlots(poly: Polygon, ridgeY: number, side: -1 | 0 | 1, p: typeof DEFAULT_PANEL, scale: number): Rect[][] {
  const b = bbox(poly[0]!);
  const w = p.alongRidgeM * scale;
  const h = p.upSlopeM * scale;
  const g = p.gapM;
  const yLo = side === 1 ? ridgeY + p.ridgeMarginM : b.minY;
  const yHi = side === -1 ? ridgeY - p.ridgeMarginM : b.maxY;
  const nCols = Math.floor((b.w + g) / (w + g));
  const nRows = Math.floor((yHi - yLo + g) / (h + g));
  if (nCols < 1 || nRows < 1) return [];
  const x0 = b.minX + (b.w - (nCols * (w + g) - g)) / 2;
  const y0 = yLo + (yHi - yLo - (nRows * (h + g) - g)) / 2;
  const rows: Rect[][] = [];
  for (let r = 0; r < nRows; r++) {
    const row: Rect[] = [];
    for (let c = 0; c < nCols; c++) {
      const rect = { x: x0 + c * (w + g), y: y0 + r * (h + g), w, h };
      if (rectFits(rect, poly, p.edgeMarginM)) row.push(rect);
    }
    if (row.length) rows.push(row);
  }
  // Eaves first: for the lower half the eaves are at the bottom (low y).
  return side === 1 ? rows.reverse() : rows;
}

/** Takes `count` slots, filling rows from the eaves and centring partial rows. */
function pickSlots(rows: Rect[][], count: number): Rect[] {
  const out: Rect[] = [];
  for (const row of rows) {
    const need = count - out.length;
    if (need <= 0) break;
    if (row.length <= need) out.push(...row);
    else {
      const start = Math.floor((row.length - need) / 2);
      out.push(...row.slice(start, start + need));
    }
  }
  return out;
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

export function buildRoofPlan(input: RoofPlanInput): RoofPlan {
  const p = { ...DEFAULT_PANEL, ...input.panel };
  const polys = toMetres(isMulti(input.coordinates) ? input.coordinates : [input.coordinates], input.crs)
    .filter((poly) => poly[0] && poly[0].length >= 4);
  if (!polys.length) throw new Error('Footprint has no usable polygon');

  // Panels go on the largest part of the building.
  const main = [...polys].sort((a, b) => ringArea(b[0]!) - ringArea(a[0]!))[0]!;
  const theta = principalAngle(main[0]!);
  // Building-aligned frame with the long axis horizontal.
  let frameAngle = theta;
  {
    const b = bbox(main[0]!.map((pt) => rotate(pt, -frameAngle)));
    if (b.h > b.w) frameAngle += Math.PI / 2;
  }
  const local = main.map((r) => r.map((pt) => rotate(pt, -frameAngle)));
  const lb = bbox(local[0]!);
  const ridgeY = lb.minY + lb.h / 2;
  const flat = /flat/i.test(input.roofShape ?? '');

  // Which half faces the main aspect? Compare the aspect with the half's outward normal.
  const aspectLocal = rotate(COMPASS_VECTORS[input.mainAspect], -frameAngle);
  const dot = aspectLocal[1]; // normal of the upper half is (0, 1)
  const preferred: -1 | 0 | 1 = flat ? 0 : dot >= 0 ? 1 : -1;
  const sides: (-1 | 0 | 1)[] = flat ? [0] : Math.abs(dot) < 0.35 ? [preferred, (-preferred) as -1 | 1] : [preferred];

  let chosen: Rect[] = [];
  for (const scale of [1, 0.9, 0.8, 0.7]) {
    const rows = sides.flatMap((s) => layoutSlots(local, ridgeY, s, p, scale));
    chosen = pickSlots(rows, input.panelCount);
    if (chosen.length >= input.panelCount) break;
  }

  // Back to world metres, then into the viewBox (north up, so y flips).
  const toWorld = (pt: Pt) => rotate(pt, frameAngle);
  const all = polys.flatMap((poly) => poly[0]!);
  const wb = bbox(all);
  const s = Math.min((FRAME.x1 - FRAME.x0) / (wb.w || 1), (FRAME.y1 - FRAME.y0) / (wb.h || 1));
  const ox = FRAME.x0 + (FRAME.x1 - FRAME.x0 - wb.w * s) / 2;
  const oy = FRAME.y0 + (FRAME.y1 - FRAME.y0 - wb.h * s) / 2;
  const toView = ([x, y]: Pt): Pt => [ox + (x - wb.minX) * s, oy + (wb.maxY - y) * s];

  const footprintSvgPath = polys
    .flatMap((poly) => poly)
    .map((ring) => {
      const pts = ring.slice(0, -1).map(toView);
      return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
    })
    .join('');

  const parts: string[] = [];
  if (!flat) {
    // Ridge along the long axis, clipped to where it's inside the footprint.
    const step = lb.w / 200;
    let a: number | null = null;
    let bEnd: number | null = null;
    for (let x = lb.minX; x <= lb.maxX; x += step) {
      if (pointInPolygon([x, ridgeY], local)) { a ??= x; bEnd = x; }
    }
    if (a !== null && bEnd !== null) {
      const [x1, y1] = toView(toWorld([a, ridgeY]));
      const [x2, y2] = toView(toWorld([bEnd, ridgeY]));
      parts.push(`<line class="pv-roof-ridge" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
    }
  }
  for (const r of chosen) {
    const pts = corners(r).map((c) => toView(toWorld(c)));
    parts.push(`<polygon class="pv-roof-panel" points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"/>`);
  }

  return {
    footprintSvgPath,
    panelAreaSvg: parts.join(''),
    panelsDrawn: chosen.length,
    truncated: chosen.length < input.panelCount,
  };
}

/**
 * Main aspect for the letter: the solar-facing direction (S, SE, SW, E, W)
 * with the largest OS roof aspect area. Ties go to the more southerly face,
 * so a symmetrical N/S pitched roof reads "South", not "North".
 */
export function mainAspectFromAreas(areas: Partial<Record<Compass, number | null>>): Compass | null {
  let best: Compass | null = null;
  let bestArea = 0;
  for (const k of ['S', 'SE', 'SW', 'E', 'W'] as Compass[]) {
    const a = areas[k] ?? 0;
    if (a > bestArea) { bestArea = a; best = k; }
  }
  return best;
}

/**
 * Plan dimensions of the main building part: length (long side), depth
 * (short side) and outline area, in metres. Used for scaffolding estimates.
 */
export function footprintDimensions(coordinates: RoofPlanInput['coordinates'], crs: RoofPlanInput['crs']) {
  const polys = toMetres(isMulti(coordinates) ? coordinates : [coordinates], crs).filter((p) => p[0] && p[0].length >= 4);
  if (!polys.length) throw new Error('Footprint has no usable polygon');
  const main = [...polys].sort((a, b) => ringArea(b[0]!) - ringArea(a[0]!))[0]!;
  const theta = principalAngle(main[0]!);
  const b = bbox(main[0]!.map((pt) => rotate(pt, -theta)));
  return { lengthM: Math.max(b.w, b.h), depthM: Math.min(b.w, b.h), areaM2: ringArea(main[0]!) };
}
