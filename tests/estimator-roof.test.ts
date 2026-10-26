import { describe, expect, it } from 'vitest';
import { aspectFromBearing, compassWord, mapFromGoogle, roofFromGoogle, usableAspect, type GoogleBuilding } from '@/lib/estimator/roof';
import { DEFAULT_SETTINGS, estimate } from '@/lib/estimator/calc';

const house: GoogleBuilding = {
  imageryQuality: 'HIGH',
  solarPotential: {
    maxArrayPanelsCount: 30,
    maxArrayAreaMeters2: 48,
    panelCapacityWatts: 400,
    roofSegmentStats: [
      { pitchDegrees: 34, azimuthDegrees: 201, stats: { areaMeters2: 31 } },
      { pitchDegrees: 33, azimuthDegrees: 21, stats: { areaMeters2: 30 } },
      { pitchDegrees: 5, azimuthDegrees: 100, stats: { areaMeters2: 2 } },
    ],
    solarPanelConfigs: [{ panelsCount: 4, yearlyEnergyDcKwh: 1700 }, { panelsCount: 14, yearlyEnergyDcKwh: 5300 }],
  },
};

describe('roof from Google Solar', () => {
  it('converts a compass bearing to PVGIS aspect (south 0, east negative, west positive)', () => {
    expect(aspectFromBearing(180)).toBe(0);
    expect(aspectFromBearing(90)).toBe(-90);
    expect(aspectFromBearing(270)).toBe(90);
    expect(Math.abs(aspectFromBearing(0))).toBe(180);
    expect(aspectFromBearing(201)).toBe(21);
  });
  it('picks the biggest roof face that does not face north, and ignores slivers', () => {
    const r = roofFromGoogle(house, 980)!;
    expect(r.bearing).toBe(201);
    expect(r.angle).toBe(34);
    expect(r.areaM2).toBe(31);
    expect(r.direction).toBe('south');
    expect(r.segments).toBe(2);
    expect(r.maxPanels).toBe(Math.floor((31 * 0.6) / 1.95)); // no panel list: 60% of the sunny face’s area
    expect(compassWord(r.bearing)).toBe('south');
  });
  it('returns null when there is no usable roof', () => {
    expect(roofFromGoogle({ solarPotential: { roofSegmentStats: [] } }, 950)).toBeNull();
    expect(roofFromGoogle(null, 950)).toBeNull();
  });
  it('a small roof caps the system and says so', () => {
    const base = { who: 'home' as const, yieldKwhPerKwp: 950, shade: 'none' as const, usage: { kind: 'kwh' as const, value: 9000 }, daytime: 'some' as const, battery: false, ev: false, heatpump: false };
    const open = estimate(base, DEFAULT_SETTINGS);
    const capped = estimate({ ...base, maxPanels: 8 }, DEFAULT_SETTINGS);
    expect(capped.panels).toBe(8);
    expect(capped.roofLimited).toBe(true);
    expect(open.roofLimited).toBe(false);
  });
});

/** 2 Marine Terrace, Caldicot: a south-west face with 12 panels and a north-north-east face with 14. Google's best layout uses both. */
const terrace: GoogleBuilding = {
  imageryQuality: 'MEDIUM',
  center: { latitude: 51.5851509, longitude: -2.7194163 },
  solarPotential: {
    panelCapacityWatts: 400,
    panelWidthMeters: 1.045,
    panelHeightMeters: 1.879,
    maxArrayAreaMeters2: 51,
    roofSegmentStats: [
      { pitchDegrees: 37, azimuthDegrees: 203.79, stats: { areaMeters2: 34 } },
      { pitchDegrees: 36, azimuthDegrees: 15.43, stats: { areaMeters2: 33 } },
      { pitchDegrees: 20, azimuthDegrees: 110, stats: { areaMeters2: 5 } },
    ],
    solarPanels: [
      ...Array.from({ length: 12 }, (_, i) => ({ center: { latitude: 51.5851 + i * 1e-6, longitude: -2.7194 }, orientation: 'LANDSCAPE', segmentIndex: 0, yearlyEnergyDcKwh: 380 })),
      ...Array.from({ length: 14 }, (_, i) => ({ center: { latitude: 51.5852 + i * 1e-6, longitude: -2.7194 }, orientation: 'LANDSCAPE', segmentIndex: 1, yearlyEnergyDcKwh: 190 })),
    ],
  },
};

describe('a roof with a north face (2 Marine Terrace)', () => {
  it('treats faces within 100 degrees of south as usable', () => {
    expect(usableAspect(204)).toBe(true);
    expect(usableAspect(15)).toBe(false);
    expect(usableAspect(110)).toBe(true);
  });
  it('counts only the sunny face: 12 panels, not Google’s 26', () => {
    const r = roofFromGoogle(terrace, 978)!;
    expect(r.maxPanels).toBe(12);
    expect(r.bearing).toBe(204);
    expect(r.angle).toBe(37);
    expect(r.areaM2).toBe(34);
  });
  it('judges shading on the sunny face only, so the north panels do not make it look shaded', () => {
    // 380 kWh from a 0.4 kW panel = 950 kWh/kWp, x 0.86 = 817, against 978 PVGIS = 0.84: a little shade, not a lot
    expect(roofFromGoogle(terrace, 978)!.shade).toBe('some');
    expect(roofFromGoogle({ ...terrace, solarPotential: { ...terrace.solarPotential, solarPanels: terrace.solarPotential!.solarPanels!.map((p) => ({ ...p, yearlyEnergyDcKwh: p.segmentIndex === 0 ? 430 : 190 })) } }, 978)!.shade).toBe('none');
  });
  it('draws only the sunny face’s panels', () => {
    const m = mapFromGoogle(terrace, { lat: 51.5851, lng: -2.7194 })!;
    expect(m.panels).toHaveLength(12);
    expect(m.panels.every((p) => p.az > 200 && p.az < 208)).toBe(true);
    expect(m.centre.lat).toBeCloseTo(51.5851509, 6);
  });
});
