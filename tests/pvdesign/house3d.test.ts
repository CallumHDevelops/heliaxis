import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHouse, cross, dot, makeProjector, northLocal, norm, type V3 } from '@/lib/pvdesign/house3d';
import { layoutPanels } from '@/lib/pvdesign/layout';
import { buildScene, sceneSvg } from '@/lib/pvdesign/render3d';

const layout = layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: { widthMm: 1134, heightMm: 1722 } }).best;
const house = (pitch = 35, storeys = 2) => buildHouse({ lengthM: 8, slopeLengthM: 3.5, pitchDeg: pitch, storeys, panels: layout.panels });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

describe('gable house geometry', () => {
  it('gets its depth and ridge height from the roof slope and pitch', () => {
    const h = house(35, 2);
    expect(h.depthM).toBeCloseTo(2 * 3.5 * Math.cos((35 * Math.PI) / 180), 6);
    expect(h.eaveM).toBeCloseTo(5.1, 6);
    expect(h.ridgeM).toBeCloseTo(5.1 + 3.5 * Math.sin((35 * Math.PI) / 180), 6);
  });
  it('a steeper roof is taller and narrower for the same slope length', () => {
    expect(house(45).ridgeM).toBeGreaterThan(house(25).ridgeM);
    expect(house(45).depthM).toBeLessThan(house(25).depthM);
  });
  it('has a polygon for every panel, and cell lines on each', () => {
    const h = house();
    expect(h.polys.filter((p) => p.kind === 'panel')).toHaveLength(layout.count);
    expect(h.lines.length).toBeGreaterThan(layout.count * 10);
  });
  it('puts every panel on the front roof slope, parallel to it, just above it', () => {
    const h = house();
    const front = h.polys.find((p) => p.kind === 'roof')!;
    const n = norm(cross(sub(front.pts[1], front.pts[0]), sub(front.pts[3], front.pts[0])));
    for (const p of h.polys.filter((x) => x.kind === 'panel')) {
      for (const q of p.pts) {
        const off = dot(sub(q, front.pts[0]), n);
        expect(Math.abs(off - 0.05)).toBeLessThan(1e-9); // lifted exactly 5 cm along the normal
      }
      expect(Math.abs(dot(p.n, n) - 1)).toBeLessThan(1e-9);
    }
  });
  it('keeps every panel inside the roof face (no overhang past the ridge, eaves or ends)', () => {
    const h = house();
    for (const p of h.polys.filter((x) => x.kind === 'panel'))
      for (const q of p.pts) {
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.x).toBeLessThanOrEqual(8);
        expect(q.z).toBeLessThanOrEqual(h.ridgeM + 0.06);
        expect(q.z).toBeGreaterThanOrEqual(h.eaveM - 0.01);
      }
  });
  it('the front slope normal points up and toward the viewer; the rear points up and away', () => {
    const roofs = house().polys.filter((p) => p.kind === 'roof');
    expect(roofs[0].n.y).toBeLessThan(0);
    expect(roofs[1].n.y).toBeGreaterThan(0);
    expect(roofs.every((r) => r.n.z > 0)).toBe(true);
  });
  it('windows are fewer on the ground floor than the door gap allows, and never overlap the door', () => {
    const h = house();
    const door = h.polys.find((p) => p.kind === 'door')!;
    const dx0 = Math.min(...door.pts.map((q) => q.x));
    const dx1 = Math.max(...door.pts.map((q) => q.x));
    for (const w of h.polys.filter((p) => p.kind === 'window' && p.pts[0].z < 2)) {
      const x0 = Math.min(...w.pts.map((q) => q.x));
      const x1 = Math.max(...w.pts.map((q) => q.x));
      expect(x1 <= dx0 || x0 >= dx1).toBe(true);
    }
  });
});

describe('compass', () => {
  it('a south-facing front has north behind the house; a west-facing one has it to the right-hand side', () => {
    const s = northLocal(180);
    expect(s.x).toBeCloseTo(0, 9);
    expect(s.y).toBeCloseTo(1, 9);
    const w = northLocal(270);
    // Front looks west; standing outside facing the house (looking east), north is to the left, which is -x.
    expect(w.x).toBeCloseTo(-1, 9);
    expect(w.y).toBeCloseTo(0, 9);
  });
});

describe('camera and scene', () => {
  it('everything on the house is in front of the camera', () => {
    const h = house();
    const cam = makeProjector(h, { yawDeg: -35, elevDeg: 24 });
    for (const p of h.polys) for (const q of p.pts) expect(cam.project(q).depth).toBeGreaterThan(0.5);
  });
  it('draws the panels from the front, and none from directly behind', () => {
    const front = buildScene(house(), { camera: { yawDeg: -30, elevDeg: 25 }, faceAzimuthDeg: 180 });
    expect(front.polys.filter((p) => p.kind === 'panel')).toHaveLength(layout.count);
    const back = buildScene(house(), { camera: { yawDeg: 180, elevDeg: 10 }, faceAzimuthDeg: 180 });
    expect(back.polys.filter((p) => p.kind === 'panel')).toHaveLength(0);
  });
  it('keeps everything drawn inside the frame', () => {
    const sc = buildScene(house(), { camera: { yawDeg: -30, elevDeg: 25 }, faceAzimuthDeg: 180 });
    for (const p of sc.polys.filter((x) => x.kind !== 'ground')) for (const [x, y] of p.pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(sc.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(sc.height);
    }
  });
  it('the SVG is marked indicative, and has a north arrow', () => {
    const svg = sceneSvg(buildScene(house(), { camera: { yawDeg: -30, elevDeg: 25 }, faceAzimuthDeg: 180 }), { caption: 'Mock-up' });
    expect(svg).toContain('Indicative — subject to site survey');
    expect(svg).toContain('>N<');
    expect(svg).toContain('Mock-up');
    if (process.env.METIS_SVG_OUT) writeFileSync(process.env.METIS_SVG_OUT, svg);
  });
});
