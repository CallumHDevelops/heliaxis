import { describe, expect, it } from 'vitest';
import { aspectFromBearing, compassWord, roofFromGoogle, type GoogleBuilding } from '@/lib/estimator/roof';
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
    expect(r.maxPanels).toBe(Math.floor(48 / 1.95));
    expect(compassWord(r.bearing)).toBe('south');
  });
  it('rates shading from Google’s own yield against an unshaded roof', () => {
    expect(roofFromGoogle(house, 980)!.shade).toBe('none'); // 5300 / (14 x 0.4) = 946 → 0.97 of 980
    expect(roofFromGoogle(house, 1300)!.shade).toBe('lots'); // 946 / 1300 = 0.73
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
