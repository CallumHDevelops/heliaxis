import { usableAspect } from './roof';

/**
 * Finding the faces of a roof from a height map, and laying panels on them. Pure maths on a small grid centred on the house
 * (x east, y north, in metres), so it can be tested with made-up roofs.
 *
 * The method: fit a tilted plane to every small patch of the height map; patches that are flat enough and lean the same way
 * are grown into one face; each face's plane gives its pitch and compass direction. Panels are then packed face by face in
 * rows lined up with the eaves, kept clear of the edges, and kept off shaded spots.
 */
export type Grid = {
  /** Cells per side. */
  n: number;
  /** Cell size in metres. */
  cell: number;
  /** Height above sea level in metres (NaN where unknown). */
  z: Float32Array;
  /** 1 for cells that belong to this house's roof. */
  ok: Uint8Array;
  /** Yearly sun per kW for each cell, shade included (NaN where unknown). */
  flux: Float32Array;
};

export const cellXY = (g: Grid, i: number, j: number) => ({ x: (i - g.n / 2 + 0.5) * g.cell, y: (g.n / 2 - j - 0.5) * g.cell });
export const xyCell = (g: Grid, x: number, y: number) => ({ i: Math.floor(x / g.cell + g.n / 2), j: Math.floor(g.n / 2 - y / g.cell) });

export type Face = {
  id: number;
  cells: number[];
  /** z = a*x + b*y + c, with x east and y north from the grid centre. */
  plane: { a: number; b: number; c: number };
  pitch: number;
  /** Compass bearing the face looks (the direction water runs off), 0 to 360, 180 = south. */
  bearing: number;
  /** Roof surface area in square metres (on the slope). */
  areaM2: number;
};

const WINDOW = 2;
const PLANAR_RMS = 0.07;
const GRADIENT_TOL = 0.12;
const MIN_CELLS_M2 = 2.4;

/** Least-squares plane through points (x, y, z). */
function fitPlane(xs: number[], ys: number[], zs: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const mz = zs.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (let k = 0; k < n; k++) {
    const dx = xs[k] - mx;
    const dy = ys[k] - my;
    const dz = zs[k] - mz;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9) return null;
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;
  return { a, b, c: mz - a * mx - b * my };
}

export function detectFaces(g: Grid): Face[] {
  const { n, cell } = g;
  const N = n * n;
  const gx = new Float32Array(N);
  const gy = new Float32Array(N);
  const planar = new Uint8Array(N);
  const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && g.ok[j * n + i] === 1 && Number.isFinite(g.z[j * n + i]);
  // 1. A small plane at every cell whose whole neighbourhood is roof: its lean, and whether it is flat enough to trust.
  for (let j = WINDOW; j < n - WINDOW; j++) {
    for (let i = WINDOW; i < n - WINDOW; i++) {
      if (!ok(i, j)) continue;
      let all = true;
      let mz = 0;
      let c = 0;
      for (let dj = -WINDOW; dj <= WINDOW && all; dj++) for (let di = -WINDOW; di <= WINDOW; di++) if (!ok(i + di, j + dj)) { all = false; break; } else { mz += g.z[(j + dj) * n + i + di]; c++; }
      if (!all) continue;
      mz /= c;
      let sx = 0, sy = 0, sxx = 0, syy = 0;
      for (let dj = -WINDOW; dj <= WINDOW; dj++) for (let di = -WINDOW; di <= WINDOW; di++) {
        const z = g.z[(j + dj) * n + i + di] - mz;
        const dx = di * cell;
        const dy = -dj * cell;
        sx += dx * z; sy += dy * z; sxx += dx * dx; syy += dy * dy;
      }
      const ax = sx / sxx;
      const ay = sy / syy;
      let rss = 0;
      for (let dj = -WINDOW; dj <= WINDOW; dj++) for (let di = -WINDOW; di <= WINDOW; di++) {
        const r = g.z[(j + dj) * n + i + di] - mz - ax * di * cell + ay * dj * cell;
        rss += r * r;
      }
      gx[j * n + i] = ax;
      gy[j * n + i] = ay;
      if (Math.sqrt(rss / c) <= PLANAR_RMS) planar[j * n + i] = 1;
    }
  }
  // 2. Grow regions of planar cells that lean the same way.
  const label = new Int32Array(N).fill(-1);
  const regions: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (!planar[s] || label[s] >= 0) continue;
    const id = regions.length;
    const cells = [s];
    label[s] = id;
    let mgx = gx[s];
    let mgy = gy[s];
    for (let q = 0; q < cells.length; q++) {
      const k = cells[q];
      const ki = k % n;
      const kj = (k - ki) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = ki + di;
        const nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const m = nj * n + ni;
        if (!planar[m] || label[m] >= 0) continue;
        if (Math.hypot(gx[m] - mgx, gy[m] - mgy) > GRADIENT_TOL) continue;
        label[m] = id;
        cells.push(m);
        const cnt = cells.length;
        mgx += (gx[m] - mgx) / cnt;
        mgy += (gy[m] - mgy) / cnt;
      }
    }
    regions.push(cells);
  }
  const minCells = Math.round(MIN_CELLS_M2 / (cell * cell));
  const keep = regions.map((r, id) => (r.length >= minCells ? id : -1));
  const faces: Face[] = [];
  const planes: ({ a: number; b: number; c: number } | null)[] = [];
  for (let id = 0; id < regions.length; id++) {
    if (keep[id] < 0) {
      planes.push(null);
      for (const k of regions[id]) label[k] = -1;
      continue;
    }
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    for (const k of regions[id]) {
      const { x, y } = cellXY(g, k % n, (k - (k % n)) / n);
      xs.push(x); ys.push(y); zs.push(g.z[k]);
    }
    planes.push(fitPlane(xs, ys, zs));
  }
  // 2b. One long slope can come out as two regions (a patch of roughness, a vent, a join in the surveyed heights splits it). Regions
  // that lean the same way and lie on one common plane are one face.
  const sample = (cells: number[], want: number) => {
    const step = Math.max(1, Math.floor(cells.length / want));
    const out: number[] = [];
    for (let q = 0; q < cells.length; q += step) out.push(cells[q]);
    return out;
  };
  const offPlane = (cells: number[], pl: { a: number; b: number; c: number }) => {
    let sum = 0;
    for (const k of cells) {
      const { x, y } = cellXY(g, k % n, (k - (k % n)) / n);
      sum += Math.abs(g.z[k] - (pl.a * x + pl.b * y + pl.c));
    }
    return sum / Math.max(1, cells.length);
  };
  const root = regions.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (let i = 0; i < regions.length; i++) {
    const pi = planes[i];
    if (!pi) continue;
    for (let j = i + 1; j < regions.length; j++) {
      const pj = planes[j];
      if (!pj || find(i) === find(j)) continue;
      const ni = Math.hypot(pi.a, pi.b, 1);
      const nj = Math.hypot(pj.a, pj.b, 1);
      const cosA = (pi.a * pj.a + pi.b * pj.b + 1) / (ni * nj);
      if (cosA < Math.cos((6 * Math.PI) / 180)) continue;
      if (offPlane(sample(regions[i], 80), pj) > 0.15 || offPlane(sample(regions[j], 80), pi) > 0.15) continue;
      root[find(j)] = find(i);
    }
  }
  for (let i = 0; i < regions.length; i++) {
    const r = find(i);
    if (r === i || !planes[i]) continue;
    for (const k of regions[i]) label[k] = r;
    regions[r] = regions[r].concat(regions[i]);
    regions[i] = [];
    planes[i] = null;
  }
  for (let i = 0; i < regions.length; i++) {
    if (!planes[i] || find(i) !== i || regions[i].length === 0) continue;
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    for (const k of regions[i]) {
      const { x, y } = cellXY(g, k % n, (k - (k % n)) / n);
      xs.push(x); ys.push(y); zs.push(g.z[k]);
    }
    planes[i] = fitPlane(xs, ys, zs) ?? planes[i];
  }
  // 3. Let each face grow into the edge cells next to it (ridges, hips, eaves), as long as they sit on its plane.
  let frontier: number[] = [];
  for (let k = 0; k < N; k++) if (label[k] >= 0) frontier.push(k);
  for (let step = 0; step < 16; step++) {
    const next: number[] = [];
    const claims = new Map<number, number>();
    for (const k of frontier) {
      const ki = k % n;
      const kj = (k - ki) / n;
      const pl = planes[label[k]];
      if (!pl) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ki + di;
        const nj = kj + dj;
        if (!ok(ni, nj)) continue;
        const m = nj * n + ni;
        if (label[m] >= 0 || claims.has(m)) continue;
        const { x, y } = cellXY(g, ni, nj);
        if (Math.abs(g.z[m] - (pl.a * x + pl.b * y + pl.c)) <= 0.3) claims.set(m, label[k]);
      }
    }
    for (const [m, id] of claims) { label[m] = id; next.push(m); }
    frontier = next;
  }
  // 3b. Small holes inside a face (a patch of rough heights, a vent's shadow in the height map) are still roof: a cell with most of its
  // neighbours on one face, and heights near that face's plane, joins it. A chimney or a skylight frame stands too far off the plane.
  for (let pass = 0; pass < 6; pass++) {
    const joins = new Map<number, number>();
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const m = j * n + i;
        if (label[m] >= 0 || !ok(i, j)) continue;
        const votes = new Map<number, number>();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const l = label[(j + dj) * n + i + di];
          if (l >= 0) votes.set(l, (votes.get(l) ?? 0) + 1);
        }
        let top = -1, topN = 0;
        for (const [l, v] of votes) if (v > topN) { top = l; topN = v; }
        const pl = top >= 0 ? planes[top] : null;
        if (!pl || topN < 3) continue;
        const { x, y } = cellXY(g, i, j);
        if (Math.abs(g.z[m] - (pl.a * x + pl.b * y + pl.c)) <= 0.4) joins.set(m, top);
      }
    }
    if (!joins.size) break;
    for (const [m, id] of joins) label[m] = id;
  }
  for (let id = 0; id < regions.length; id++) {
    const pl = planes[id];
    if (!pl) continue;
    const cells: number[] = [];
    for (let k = 0; k < N; k++) if (label[k] === id) cells.push(k);
    const slope = Math.hypot(pl.a, pl.b);
    const pitch = (Math.atan(slope) * 180) / Math.PI;
    if (pitch > 70 || cells.length < minCells) continue;
    const bearing = (((Math.atan2(-pl.a, -pl.b) * 180) / Math.PI) + 360) % 360;
    faces.push({ id: faces.length, cells, plane: pl, pitch, bearing, areaM2: (cells.length * cell * cell) / Math.cos((pitch * Math.PI) / 180) });
  }
  return faces;
}

export type PackOptions = { panelW: number; panelH: number; clearance: number; gap: number };
export type Placed = { x: number; y: number; o: 'p' | 'l'; az: number; pt: number; flux: number; face: number; /** Across the face (along the eaves) and down it, in metres, for ordering. */ u: number; v: number };

const SAMPLE = 6;

/**
 * Panels on every face that looks towards the sun, in rows lined up with the eaves. Each face is tried with panels upright and
 * on their side and at a few starting offsets, and the arrangement that fits most wins. Returned face by face, the sunniest
 * faces and panels first.
 */
export function packFaces(g: Grid, faces: Face[], opt: PackOptions): Placed[] {
  const { n, cell } = g;
  const usable = faces.filter((f) => usableAspect(f.bearing) && f.pitch >= 3 && f.pitch <= 65);
  const label = new Int32Array(n * n).fill(-1);
  for (const f of faces) for (const k of f.cells) label[k] = f.id;
  const fluxes: number[] = [];
  for (const f of usable) for (const k of f.cells) if (Number.isFinite(g.flux[k]) && g.flux[k] > 0) fluxes.push(g.flux[k]);
  fluxes.sort((a, b) => a - b);
  const p90 = fluxes.length ? fluxes[Math.floor(fluxes.length * 0.9)] : 0;
  const minFlux = p90 * 0.7;
  const k = Math.max(0, Math.round(opt.clearance / cell));
  const perFace: { placed: Placed[]; sun: number }[] = [];
  for (const f of usable) {
    const eroded = new Uint8Array(n * n);
    for (const c of f.cells) {
      const ci = c % n;
      const cj = (c - ci) / n;
      let all = true;
      for (let dj = -k; dj <= k && all; dj++) for (let di = -k; di <= k; di++) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n || label[nj * n + ni] !== f.id) { all = false; break; }
      }
      if (all) eroded[c] = 1;
    }
    const b = (f.bearing * Math.PI) / 180;
    const d = { x: Math.sin(b), y: Math.cos(b) };
    const a = { x: Math.cos(b), y: -Math.sin(b) };
    const cosP = Math.cos((f.pitch * Math.PI) / 180);
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const c of f.cells) {
      const { x, y } = cellXY(g, c % n, (c - (c % n)) / n);
      const u = x * a.x + y * a.y;
      const v = x * d.x + y * d.y;
      umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    let best: Placed[] = [];
    let bestSun = 0;
    for (const o of ['p', 'l'] as const) {
      const across = o === 'p' ? opt.panelW : opt.panelH;
      const along = (o === 'p' ? opt.panelH : opt.panelW) * cosP;
      const stepU = across + opt.gap;
      const stepV = along + opt.gap;
      for (let su = 0; su < 4; su++) for (let sv = 0; sv < 4; sv++) {
        const placed: Placed[] = [];
        let sun = 0;
        for (let u0 = umin - cell / 2 + (su * stepU) / 4; u0 + across <= umax + cell / 2; u0 += stepU) {
          for (let v0 = vmin - cell / 2 + (sv * stepV) / 4; v0 + along <= vmax + cell / 2; v0 += stepV) {
            let good = true;
            let fs = 0;
            let fc = 0;
            for (let p = 0; p < SAMPLE && good; p++) for (let q = 0; q < SAMPLE; q++) {
              const u = u0 + ((p + 0.5) / SAMPLE) * across;
              const v = v0 + ((q + 0.5) / SAMPLE) * along;
              const { i, j } = xyCell(g, u * a.x + v * d.x, u * a.y + v * d.y);
              if (i < 0 || j < 0 || i >= n || j >= n || !eroded[j * n + i]) { good = false; break; }
              const fl = g.flux[j * n + i];
              if (Number.isFinite(fl)) { fs += fl; fc++; }
            }
            if (!good) continue;
            const flux = fc ? fs / fc : 0;
            if (flux < minFlux) continue;
            const uc = u0 + across / 2;
            const vc = v0 + along / 2;
            placed.push({ x: uc * a.x + vc * d.x, y: uc * a.y + vc * d.y, o, az: f.bearing, pt: f.pitch, flux, face: f.id, u: uc, v: vc });
            sun += flux;
          }
        }
        if (placed.length > best.length || (placed.length === best.length && sun > bestSun)) { best = placed; bestSun = sun; }
      }
    }
    if (best.length) {
      // Fewer panels than the face holds should still look tidy: the sunniest first (in 10% steps), then whole rows from the eaves up.
      const top = Math.max(...best.map((p) => p.flux)) || 1;
      const band = (p: Placed) => Math.round((p.flux / top) * 10);
      perFace.push({ placed: best.sort((p, q) => band(q) - band(p) || q.v - p.v || p.u - q.u), sun: bestSun });
    }
  }
  // The sunniest face first, in full. A smaller system that spills onto the next face starts at the end of it nearest the panels
  // already laid, so the extra ones sit beside the block and not at the far end of the roof.
  const ordered = perFace.sort((p, q) => q.sun - p.sun);
  const out: Placed[] = [];
  for (const f of ordered) {
    if (!out.length) {
      out.push(...f.placed);
      continue;
    }
    const cx = out.reduce((a, p) => a + p.x, 0) / out.length;
    const cy = out.reduce((a, p) => a + p.y, 0) / out.length;
    out.push(...[...f.placed].sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy)));
  }
  return out;
}

/** The corners of the smallest convex shape round some cells, for drawing a face. */
export function hull(g: Grid, cells: number[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const c of cells) {
    const { x, y } = cellXY(g, c % g.n, (c - (c % g.n)) / g.n);
    const h = g.cell / 2;
    pts.push({ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h });
  }
  pts.sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: { x: number; y: number }[] = [];
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
