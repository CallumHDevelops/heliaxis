import { describe, expect, it } from 'vitest';
import { minAreaRect, polygonArea, ringToMetres, roofFromFootprint, type LngLat } from '@/lib/pvdesign/footprint';

const LAT0 = 51.5;
const LNG0 = -3.2;
/** A rectangle `l` by `w` metres, its long side on compass bearing `bearing`, as a closed lat/lng ring. */
function rect(l: number, w: number, bearing: number, extra: { x: number; y: number }[] = []): LngLat[] {
  const t = (bearing * Math.PI) / 180;
  const along = { x: Math.sin(t), y: Math.cos(t) }; // east, north
  const across = { x: -along.y, y: along.x };
  const corners = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([a, b]) => ({ x: a * along.x + b * across.x, y: a * along.y + b * across.y }));
  const pts = extra.length ? extra : corners;
  const ring = pts.map((p) => ({ lat: LAT0 + p.y / 111320, lng: LNG0 + p.x / (111320 * Math.cos((LAT0 * Math.PI) / 180)) }));
  return [...ring, ring[0]];
}

describe('footprint to metres', () => {
  it('measures a 10 x 6 m rectangle to within a few centimetres, wherever it points', () => {
    for (const bearing of [0, 30, 90, 117, 170]) {
      const pts = ringToMetres(rect(10, 6, bearing));
      expect(polygonArea(pts)).toBeGreaterThan(59.5);
      expect(polygonArea(pts)).toBeLessThan(60.5);
      const r = minAreaRect(pts);
      expect(r.length).toBeCloseTo(10, 1);
      expect(r.width).toBeCloseTo(6, 1);
    }
  });
  it('finds the compass bearing of the long side', () => {
    for (const bearing of [0, 30, 90, 117, 170]) {
      const r = minAreaRect(ringToMetres(rect(10, 6, bearing)));
      const diff = Math.abs(((r.bearing - bearing + 270) % 180) - 90);
      expect(diff, `bearing ${bearing}`).toBeLessThan(0.7);
    }
  });
});

describe('roof estimate from an outline', () => {
  it('a house with its long side east-west has a south-facing slope', () => {
    const r = roofFromFootprint(rect(10, 6, 90));
    expect(r.lengthM).toBeCloseTo(10, 0);
    expect(r.depthM).toBeCloseTo(6, 0);
    expect(r.faceAzimuthDeg).toBe(180);
    expect(r.ridgeBearingDeg).toBe(90);
    // Slope: half the 6 m span at 35 degrees pitch.
    expect(r.slopeLengthM).toBeCloseTo(3 / Math.cos((35 * Math.PI) / 180), 1);
    expect(r.rectangularity).toBeGreaterThan(0.97);
  });
  it('a north-south house has its better slope facing east or west, whichever is nearer south', () => {
    const r = roofFromFootprint(rect(10, 6, 0));
    expect([90, 270]).toContain(r.faceAzimuthDeg);
  });
  it('a slightly turned house picks the slope nearest south', () => {
    const r = roofFromFootprint(rect(10, 6, 100)); // ridge a bit south-of-east-west
    expect(Math.abs(r.faceAzimuthDeg - 180)).toBeLessThanOrEqual(15);
  });
  it('always says the shape and pitch are assumed', () => {
    expect(roofFromFootprint(rect(9, 5, 90)).warnings[0]).toMatch(/assumed, not surveyed/);
  });
  it('warns about an L-shape and about a long thin terrace outline', () => {
    const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 9 }, { x: 0, y: 9 }];
    expect(roofFromFootprint(rect(0, 0, 0, L)).warnings.join(' ')).toMatch(/not a plain rectangle/);
    expect(roofFromFootprint(rect(30, 5, 90)).warnings.join(' ')).toMatch(/terrace/);
  });
  it('uses the pitch it is given', () => {
    expect(roofFromFootprint(rect(10, 6, 90), 45).slopeLengthM).toBeGreaterThan(roofFromFootprint(rect(10, 6, 90), 25).slopeLengthM);
  });
  it('rejects a degenerate outline', () => {
    expect(() => roofFromFootprint([{ lat: 51, lng: -3 }, { lat: 51, lng: -3 }])).toThrow();
  });
});
