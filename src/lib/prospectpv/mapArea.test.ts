import { describe, expect, it } from 'vitest';
import {
  areaHectares, geometryFromGeoJson, limitsFromSettings, ringSelfIntersects, validateDrawnArea, DEFAULT_LIMITS, type Position,
} from './mapArea';
import { buildEstimate, type EstimateInput } from './mapEstimate';

// About 100 m x 100 m in Cardiff (1 ha): 0.0014286 deg lng ≈ 100 m at 51.5°N, 0.0008983 deg lat ≈ 100 m.
const cardiff = (w = 0.0014286, h = 0.0008983, lng = -3.18, lat = 51.48): Position[] => [
  [lng, lat], [lng + w, lat], [lng + w, lat + h], [lng, lat + h], [lng, lat],
];
const poly = (ring: Position[]) => ({ type: 'Polygon', coordinates: [ring] });

describe('area maths', () => {
  it('measures a 100 m square as about one hectare', () => {
    const ha = areaHectares(cardiff());
    expect(ha).toBeGreaterThan(0.97);
    expect(ha).toBeLessThan(1.03);
  });
  it('does not depend on the direction the shape was drawn', () => {
    expect(areaHectares([...cardiff()].reverse())).toBeCloseTo(areaHectares(cardiff()), 6);
  });
});

describe('self-crossing', () => {
  it('accepts a simple square', () => expect(ringSelfIntersects(cardiff())).toBe(false));
  it('rejects a bow-tie', () => {
    const bow: Position[] = [[-3.18, 51.48], [-3.178, 51.481], [-3.178, 51.48], [-3.18, 51.481], [-3.18, 51.48]];
    expect(ringSelfIntersects(bow)).toBe(true);
  });
  it('accepts a concave L shape', () => {
    const l: Position[] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]].map(([x, y]) => [-3.18 + x! * 0.001, 51.48 + y! * 0.001] as Position);
    expect(ringSelfIntersects(l)).toBe(false);
  });
});

describe('validateDrawnArea', () => {
  it('accepts a good polygon and returns a MultiPolygon with its size', () => {
    const r = validateDrawnArea(poly(cardiff()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.geometry.type).toBe('MultiPolygon');
      expect(r.shapes).toBe(1);
      expect(r.vertices).toBe(4);
      expect(r.areaHa).toBeGreaterThan(0.9);
    }
  });
  it('accepts a MultiPolygon and adds the shapes up', () => {
    const a = cardiff(); const b = cardiff(0.0014286, 0.0008983, -3.17, 51.49);
    const r = validateDrawnArea({ type: 'MultiPolygon', coordinates: [[a], [b]] });
    expect(r.ok && r.shapes).toBe(2);
    expect(r.ok && r.areaHa).toBeGreaterThan(1.9);
  });
  it.each([
    ['nothing', null, 'empty'],
    ['a point', { type: 'Point', coordinates: [0, 0] }, 'not_polygon'],
    ['an empty list', { type: 'MultiPolygon', coordinates: [] }, 'empty'],
    ['text coordinates', { type: 'Polygon', coordinates: [[['a', 'b'], [1, 1], [2, 2], ['a', 'b']]] }, 'bad_coordinates'],
    ['NaN', { type: 'Polygon', coordinates: [[[NaN, 51], [-3, 51], [-3, 52], [NaN, 51]]] }, 'bad_coordinates'],
  ])('rejects %s', (_n, input, problem) => {
    const r = validateDrawnArea(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toBe(problem);
  });
  it('rejects an open ring', () => {
    const r = validateDrawnArea(poly(cardiff().slice(0, 4)));
    expect(!r.ok && r.problem).toBe('open_ring');
  });
  it('rejects fewer than three corners', () => {
    const r = validateDrawnArea(poly([[-3.18, 51.48], [-3.17, 51.48], [-3.18, 51.48]]));
    expect(!r.ok && r.problem).toBe('too_few_points');
  });
  it('rejects a shape with a hole', () => {
    const r = validateDrawnArea({ type: 'Polygon', coordinates: [cardiff(), cardiff(0.0003, 0.0002, -3.1795, 51.4803)] });
    expect(!r.ok && r.problem).toBe('has_hole');
  });
  it('rejects a bow-tie with a clear message', () => {
    const r = validateDrawnArea(poly([[-3.18, 51.48], [-3.178, 51.481], [-3.178, 51.48], [-3.18, 51.481], [-3.18, 51.48]]));
    expect(!r.ok && r.problem).toBe('self_crossing');
    expect(!r.ok && r.message).toMatch(/crosses over itself/);
  });
  it('rejects a flat shape', () => {
    const r = validateDrawnArea(poly([[-3.18, 51.48], [-3.17, 51.48], [-3.16, 51.48], [-3.18, 51.48]]));
    expect(!r.ok && r.problem).toBe('zero_area');
  });
  it('rejects an area outside Great Britain', () => {
    const r = validateDrawnArea(poly(cardiff(0.001, 0.001, 2.35, 48.85)));
    expect(!r.ok && r.problem).toBe('outside_coverage');
  });
  it('rejects too many shapes and too many corners', () => {
    const many = { type: 'MultiPolygon', coordinates: Array.from({ length: 6 }, (_, i) => [cardiff(0.001, 0.001, -3.18 + i * 0.01)]) };
    expect(validateDrawnArea(many, { ...DEFAULT_LIMITS, max_shapes: 5 })).toMatchObject({ ok: false, problem: 'too_many_shapes' });
    expect(validateDrawnArea(poly(cardiff()), { ...DEFAULT_LIMITS, max_vertices: 3 })).toMatchObject({ ok: false, problem: 'too_many_points' });
  });
  it('rejects an area over the limit, and allows it when no limit is set', () => {
    const big = poly(cardiff(0.02, 0.012));
    expect(validateDrawnArea(big, { ...DEFAULT_LIMITS, max_area_ha: 50 })).toMatchObject({ ok: false, problem: 'too_large' });
    expect(validateDrawnArea(big, { ...DEFAULT_LIMITS, max_area_ha: null }).ok).toBe(true);
  });
  it('does not change its input', () => {
    const input = poly(cardiff());
    const copy = JSON.stringify(input);
    validateDrawnArea(input);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe('limitsFromSettings', () => {
  it('reads sensible numbers and ignores junk', () => {
    expect(limitsFromSettings({ max_area_ha: 50, max_shapes: 3, max_vertices: 100 })).toEqual({ max_area_ha: 50, max_shapes: 3, max_vertices: 100 });
    expect(limitsFromSettings({ max_area_ha: -1, max_shapes: 'x' })).toEqual(DEFAULT_LIMITS);
    expect(limitsFromSettings(null)).toEqual(DEFAULT_LIMITS);
  });
});

describe('geometryFromGeoJson', () => {
  const g = poly(cardiff());
  it('takes a bare geometry, a Feature or a FeatureCollection', () => {
    expect(geometryFromGeoJson(g)).toEqual(g);
    expect(geometryFromGeoJson({ type: 'Feature', geometry: g })).toEqual(g);
    const fc = geometryFromGeoJson({ type: 'FeatureCollection', features: [{ geometry: g }, { geometry: { type: 'Point', coordinates: [0, 0] } }] }) as { type: string; coordinates: unknown[] };
    expect(fc.type).toBe('MultiPolygon');
    expect(fc.coordinates).toHaveLength(1);
  });
  it('returns null for anything else', () => {
    expect(geometryFromGeoJson({ type: 'FeatureCollection', features: [] })).toBeNull();
    expect(geometryFromGeoJson('nope')).toBeNull();
  });
});

describe('buildEstimate', () => {
  const base: EstimateInput = {
    homesFound: 400, solarCallsThisMonth: 0, freeCallsPerMonth: 10000, costPerCallGbp: 0.01,
    monthlyCapGbp: 100, spentThisMonthGbp: 0, maxHomesPerScan: 2000,
  };
  it('is free inside the allowance', () => {
    const e = buildEstimate(base);
    expect(e).toMatchObject({ solarCallsAtMost: 400, freeCallsLeft: 10000, billableCallsAtMost: 0, costAtMostGbp: 0, canConfirm: true });
  });
  it('charges only the calls above the free allowance left', () => {
    const e = buildEstimate({ ...base, solarCallsThisMonth: 9800 });
    expect(e.freeCallsLeft).toBe(200);
    expect(e.billableCallsAtMost).toBe(200);
    expect(e.costAtMostGbp).toBe(2);
  });
  it('never invents a cost when the rate is missing', () => {
    const e = buildEstimate({ ...base, solarCallsThisMonth: 9800, costPerCallGbp: null });
    expect(e.costAtMostGbp).toBeNull();
    expect(e.notes.join(' ')).toMatch(/cost per Google Solar call isn’t set/);
  });
  it('shows nothing about the allowance when it is unset', () => {
    const e = buildEstimate({ ...base, freeCallsPerMonth: null });
    expect(e.freeCallsLeft).toBeNull();
    expect(e.costAtMostGbp).toBeNull();
  });
  it('blocks an empty area and a scan over the home limit', () => {
    expect(buildEstimate({ ...base, homesFound: 0 }).canConfirm).toBe(false);
    const big = buildEstimate({ ...base, homesFound: 2500 });
    expect(big.canConfirm).toBe(false);
    expect(big.blockers[0]).toMatch(/over the limit/);
  });
  it('blocks a worst case that is over the monthly cap', () => {
    const e = buildEstimate({ ...base, homesFound: 1500, solarCallsThisMonth: 10000, monthlyCapGbp: 10, spentThisMonthGbp: 0 });
    expect(e.costAtMostGbp).toBe(15);
    expect(e.canConfirm).toBe(false);
  });
  it('reminds the person to set a cap when there is none', () => {
    const e = buildEstimate({ ...base, monthlyCapGbp: null });
    expect(e.capRemainingGbp).toBeNull();
    expect(e.notes.join(' ')).toMatch(/No monthly spend cap/);
  });
});

import { squareAround } from './mapArea';
describe('squareAround', () => {
  it('makes a closed square of about the size asked for', () => {
    const sq = squareAround(-3.18, 51.48, 200);
    const ring = sq.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const ha = areaHectares(ring);
    expect(ha).toBeGreaterThan(3.9);
    expect(ha).toBeLessThan(4.1);
    expect(validateDrawnArea(sq).ok).toBe(true);
  });
});
