import type { Placed } from './layout';

/**
 * A mock 3D gable-roof house with the panels on its roof, for the design pack. Pure.
 * Local frame in metres: x runs along the eaves (and the ridge), y across the house (y = 0 is the front wall), z is up.
 * The panel face is the front roof slope, which looks toward -y. The layout code places panels on a flat face
 * measured along the eaves (u) and down the slope from the ridge (v); this maps that straight onto the 3D slope.
 * The shape (gable), the pitch and the storeys are assumptions unless they came from a survey: the drawing says so.
 */

export type V3 = { x: number; y: number; z: number };
export type PolyKind = 'ground' | 'wall' | 'gable' | 'window' | 'door' | 'roof' | 'panel';
export type Poly3 = { kind: PolyKind; pts: V3[]; /** Outward unit normal. */ n: V3 };
export type Line3 = { a: V3; b: V3 };
export type House = {
  polys: Poly3[];
  /** Cell lines on the panels. */
  lines: Line3[];
  lengthM: number;
  depthM: number;
  eaveM: number;
  ridgeM: number;
  slopeM: number;
  pitchDeg: number;
};

export type HouseInput = {
  /** Roof face width along the eaves, metres. */
  lengthM: number;
  /** Roof face length up the slope, metres. */
  slopeLengthM: number;
  pitchDeg: number;
  storeys: number;
  /** Panels in face coordinates (mm): x along the eaves, y down the slope from the ridge. */
  panels: Placed[];
};

export const DEFAULT_PITCH_DEG = 35;
export const DEFAULT_STOREYS = 2;
export const STOREY_HEIGHT_M = 2.55;
const LIFT = 0.05;

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const sub = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a: V3, k: number): V3 => v(a.x * k, a.y * k, a.z * k);
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};
export const centroid = (pts: V3[]): V3 => mul(pts.reduce(add, v(0, 0, 0)), 1 / pts.length);

export function buildHouse(i: HouseInput): House {
  const th = (i.pitchDeg * Math.PI) / 180;
  const L = i.lengthM;
  const S = i.slopeLengthM;
  const D = 2 * S * Math.cos(th);
  const he = Math.max(1, i.storeys) * STOREY_HEIGHT_M;
  const rise = S * Math.sin(th);
  const zr = he + rise;
  const polys: Poly3[] = [];
  const quad = (kind: PolyKind, a: V3, b: V3, c: V3, d: V3, n: V3) => polys.push({ kind, pts: [a, b, c, d], n });

  // Ground, then the four walls.
  const g = 3.6;
  quad('ground', v(-g, -g, 0), v(L + g, -g, 0), v(L + g, D + g, 0), v(-g, D + g, 0), v(0, 0, 1));
  quad('wall', v(0, 0, 0), v(L, 0, 0), v(L, 0, he), v(0, 0, he), v(0, -1, 0));
  quad('wall', v(L, D, 0), v(0, D, 0), v(0, D, he), v(L, D, he), v(0, 1, 0));
  polys.push({ kind: 'gable', pts: [v(0, D, 0), v(0, 0, 0), v(0, 0, he), v(0, D / 2, zr), v(0, D, he)], n: v(-1, 0, 0) });
  polys.push({ kind: 'gable', pts: [v(L, 0, 0), v(L, D, 0), v(L, D, he), v(L, D / 2, zr), v(L, 0, he)], n: v(1, 0, 0) });

  // Front wall: a door, and windows on each storey.
  const storeys = Math.max(1, Math.round(i.storeys));
  const door = Math.min(1, L * 0.12);
  const doorX = Math.max(0.5, L * 0.18);
  quad('door', v(doorX, -0.01, 0), v(doorX + door, -0.01, 0), v(doorX + door, -0.01, 2.05), v(doorX, -0.01, 2.05), v(0, -1, 0));
  const winCount = Math.max(1, Math.floor(L / 2.6));
  const ww = 1.0;
  for (let s = 0; s < storeys; s++) {
    const z0 = s * STOREY_HEIGHT_M + 0.9;
    for (let k = 0; k < winCount; k++) {
      const cx = ((k + 0.5) / winCount) * L;
      if (s === 0 && cx > doorX - 0.7 && cx < doorX + door + 0.7) continue;
      quad('window', v(cx - ww / 2, -0.01, z0), v(cx + ww / 2, -0.01, z0), v(cx + ww / 2, -0.01, z0 + 1.1), v(cx - ww / 2, -0.01, z0 + 1.1), v(0, -1, 0));
    }
  }

  // The two roof slopes. The front one (looking toward -y) carries the panels.
  const nf = v(0, -Math.sin(th), Math.cos(th));
  quad('roof', v(0, 0, he), v(L, 0, he), v(L, D / 2, zr), v(0, D / 2, zr), nf);
  quad('roof', v(L, D, he), v(0, D, he), v(0, D / 2, zr), v(L, D / 2, zr), v(0, Math.sin(th), Math.cos(th)));

  // Panels, lifted a little off the slope. Face point (u along the eaves, w down the slope from the ridge).
  const P = (u: number, w: number): V3 => add(v(u, D / 2 - w * Math.cos(th), zr - w * Math.sin(th)), mul(nf, LIFT));
  const lines: Line3[] = [];
  for (const p of i.panels) {
    const u0 = p.x / 1000;
    const w0 = p.y / 1000;
    const u1 = (p.x + p.w) / 1000;
    const w1 = (p.y + p.h) / 1000;
    polys.push({ kind: 'panel', pts: [P(u0, w0), P(u1, w0), P(u1, w1), P(u0, w1)], n: nf });
    // Cell grid: 6 columns by 10 rows on the long side, however the panel sits.
    const cols = p.w >= p.h ? 10 : 6;
    const rows = p.w >= p.h ? 6 : 10;
    for (let c = 1; c < cols; c++) lines.push({ a: P(u0 + ((u1 - u0) * c) / cols, w0), b: P(u0 + ((u1 - u0) * c) / cols, w1) });
    for (let r = 1; r < rows; r++) lines.push({ a: P(u0, w0 + ((w1 - w0) * r) / rows), b: P(u1, w0 + ((w1 - w0) * r) / rows) });
  }
  return { polys, lines, lengthM: L, depthM: D, eaveM: he, ridgeM: zr, slopeM: S, pitchDeg: i.pitchDeg };
}

/**
 * Local direction of north on the ground, for a front face that looks toward compass bearing `faceAzimuthDeg`
 * (180 = south-facing). Derived from: the face looks toward -y at that bearing, and +x is 90 degrees counter-clockwise.
 */
export function northLocal(faceAzimuthDeg: number): { x: number; y: number } {
  const a = (faceAzimuthDeg * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

export type Camera = { yawDeg: number; elevDeg: number };
export type Projected = { x: number; y: number; depth: number };

/** A perspective camera looking at the middle of the house from `yawDeg` around it (0 = in front of the front wall) at `elevDeg` above the ground. */
export function makeProjector(h: House, cam: Camera) {
  const c = v(h.lengthM / 2, h.depthM / 2, h.eaveM / 2 + 0.5);
  const R = Math.max(h.lengthM, h.depthM, h.ridgeM) * 2.4 + 6;
  const yaw = (cam.yawDeg * Math.PI) / 180;
  const el = (cam.elevDeg * Math.PI) / 180;
  const pos = add(c, v(R * Math.sin(yaw) * Math.cos(el), -R * Math.cos(yaw) * Math.cos(el), R * Math.sin(el)));
  const f = norm(sub(c, pos));
  const right = norm(cross(f, v(0, 0, 1)));
  const up = cross(right, f);
  return {
    pos,
    project(p: V3): Projected {
      const d = sub(p, pos);
      const depth = dot(d, f);
      const k = 1 / Math.max(0.1, depth);
      return { x: dot(d, right) * k, y: -dot(d, up) * k, depth };
    },
  };
}
