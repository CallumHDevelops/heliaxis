import { describe, expect, it } from 'vitest';
import { inside, metresPerPixel, panelPolygon, toPixel } from '@/lib/estimator/overlay';

const centre = { lat: 51.6, lng: -2.7 };

describe('roof overlay maths', () => {
  it('puts the centre in the middle of the picture and north up, east right', () => {
    const c = toPixel(centre, centre);
    expect(c.x).toBeCloseTo(320, 6);
    expect(c.y).toBeCloseTo(320, 6);
    const north = toPixel({ lat: 51.6005, lng: -2.7 }, centre);
    const east = toPixel({ lat: 51.6, lng: -2.6995 }, centre);
    expect(north.y).toBeLessThan(320);
    expect(east.x).toBeGreaterThan(320);
  });
  it('a point 10 m north is about 10 / metresPerPixel pixels up', () => {
    const dLat = 10 / 111_320;
    const up = 320 - toPixel({ lat: centre.lat + dLat, lng: centre.lng }, centre).y;
    expect(up).toBeCloseTo(10 / metresPerPixel(centre.lat), 1);
    expect(metresPerPixel(51.6)).toBeGreaterThan(0.08);
    expect(metresPerPixel(51.6)).toBeLessThan(0.1);
  });
  it('a south-facing portrait panel is tall (its long side runs north to south) and centred', () => {
    const poly = panelPolygon({ ...centre, orientation: 'portrait', azimuth: 180 }, 1.045, 1.879, centre);
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const mpp = metresPerPixel(centre.lat);
    expect(w).toBeCloseTo(1.045 / mpp, 1);
    expect(h).toBeCloseTo(1.879 / mpp, 1);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(320, 4);
  });
  it('an east-facing portrait panel is wide (long side east to west); landscape swaps them', () => {
    const e = panelPolygon({ ...centre, orientation: 'portrait', azimuth: 90 }, 1.045, 1.879, centre);
    const w = Math.max(...e.map((p) => p.x)) - Math.min(...e.map((p) => p.x));
    const h = Math.max(...e.map((p) => p.y)) - Math.min(...e.map((p) => p.y));
    expect(w).toBeGreaterThan(h);
    const ls = panelPolygon({ ...centre, orientation: 'landscape', azimuth: 180 }, 1.045, 1.879, centre);
    expect(Math.max(...ls.map((p) => p.x)) - Math.min(...ls.map((p) => p.x))).toBeGreaterThan(Math.max(...ls.map((p) => p.y)) - Math.min(...ls.map((p) => p.y)));
  });
  it('finds the building a point is inside', () => {
    const ring = [
      { lat: 51.0, lng: -3.0 },
      { lat: 51.0, lng: -2.0 },
      { lat: 52.0, lng: -2.0 },
      { lat: 52.0, lng: -3.0 },
    ];
    expect(inside({ lat: 51.5, lng: -2.5 }, ring)).toBe(true);
    expect(inside({ lat: 53, lng: -2.5 }, ring)).toBe(false);
  });
});
