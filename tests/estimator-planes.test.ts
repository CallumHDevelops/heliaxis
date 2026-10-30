import { describe, expect, it } from 'vitest';
import { detectFaces, packFaces, cellXY, type Grid } from '@/lib/estimator/planes';
import { convergence, fromUtm, toUtm } from '@/lib/estimator/utm';

const TAN = Math.tan((35 * Math.PI) / 180);

/** A 10 x 6 m gable roof, ridge running east-west, 35 degrees, with a little noise. */
function gable(noise = 0.02): Grid {
  const n = 200;
  const cell = 0.2;
  const g: Grid = { n, cell, z: new Float32Array(n * n).fill(NaN), ok: new Uint8Array(n * n), flux: new Float32Array(n * n).fill(NaN) };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const { x, y } = cellXY(g, i, j);
    if (Math.abs(x) > 5 || Math.abs(y) > 3) continue;
    g.z[j * n + i] = 8 + (3 - Math.abs(y)) * TAN + rnd() * noise;
    g.ok[j * n + i] = 1;
    g.flux[j * n + i] = 900;
  }
  return g;
}
const OPT = { panelW: 1.05, panelH: 1.75, clearance: 0.4, gap: 0.02 };

describe('roof faces from a height map', () => {
  it('finds the two faces of a gable roof with the right pitch and direction', () => {
    const faces = detectFaces(gable());
    const big = faces.filter((f) => f.areaM2 > 15);
    expect(big).toHaveLength(2);
    const south = big.find((f) => Math.abs(f.bearing - 180) < 8)!;
    const north = big.find((f) => f.bearing < 8 || f.bearing > 352)!;
    expect(south && north).toBeTruthy();
    expect(south.pitch).toBeGreaterThan(33);
    expect(south.pitch).toBeLessThan(37);
    expect(south.areaM2).toBeGreaterThan(33);
    expect(south.areaM2).toBeLessThan(41);
  });
  it('packs panels only on the sunny face, in rows, clear of the edges', () => {
    const g = gable();
    const placed = packFaces(g, detectFaces(g), OPT);
    expect(placed.length).toBeGreaterThanOrEqual(9);
    expect(placed.every((p) => Math.abs(p.az - 180) < 8)).toBe(true);
    expect(placed.every((p) => p.y < 0 && p.y > -3 && Math.abs(p.x) < 5 - 0.4)).toBe(true);
    // Rows are lined up: only a few distinct row positions along the slope.
    const rows = new Set(placed.map((p) => p.y.toFixed(1)));
    expect(rows.size).toBeLessThanOrEqual(3);
  });
  it('leaves out panels on shaded ground', () => {
    const g = gable();
    for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
      const { x } = cellXY(g, i, j);
      if (x < -1) g.flux[j * g.n + i] = 300;
    }
    const placed = packFaces(g, detectFaces(g), OPT);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.every((p) => p.x > -1.6)).toBe(true);
  });
  it('puts nothing on a roof that faces north', () => {
    const g = gable();
    for (let k = 0; k < g.z.length; k++) if (g.ok[k]) { const { x, y } = cellXY(g, k % g.n, (k - (k % g.n)) / g.n); g.z[k] = 8 + (y + 3) * TAN * -1 + 6 * TAN + 0 * x; }
    expect(packFaces(g, detectFaces(g), OPT)).toHaveLength(0);
  });
});

describe('UTM', () => {
  it('round trips and puts the central meridian at 500000', () => {
    const { e, n } = toUtm(51.6, -3, 30);
    expect(e).toBeCloseTo(500000, 3);
    const back = fromUtm(...(Object.values(toUtm(51.6, -2.7, 30)) as [number, number]), 30);
    expect(back.lat).toBeCloseTo(51.6, 7);
    expect(back.lng).toBeCloseTo(-2.7, 7);
    expect(n).toBeGreaterThan(5_700_000);
    expect(convergence(51.6, -3, 30)).toBeCloseTo(0, 10);
    expect(convergence(51.6, -2.7, 30)).toBeGreaterThan(0);
  });
});

describe('one long slope with a rough patch across it', () => {
  it('stays one face, and panels run along the whole length', () => {
    const n = 240;
    const cell = 0.2;
    const g: Grid = { n, cell, z: new Float32Array(n * n).fill(NaN), ok: new Uint8Array(n * n), flux: new Float32Array(n * n).fill(NaN) };
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const { x, y } = cellXY(g, i, j);
      if (Math.abs(x) > 12 || Math.abs(y) > 2.5) continue;
      // A single south-facing slope, 24 m long, with a 1.4 m band of rough heights across the middle.
      const rough = Math.abs(x) < 0.7 ? rnd() * 0.35 : rnd() * 0.01;
      g.z[j * n + i] = 8 + (y + 2.5) * TAN + rough;
      g.ok[j * n + i] = 1;
      g.flux[j * n + i] = 900;
    }
    const faces = detectFaces(g).filter((f) => f.areaM2 > 10);
    expect(faces).toHaveLength(1);
    const placed = packFaces(g, faces, OPT);
    expect(Math.min(...placed.map((p) => p.x))).toBeLessThan(-8);
    expect(Math.max(...placed.map((p) => p.x))).toBeGreaterThan(8);
  });
});
