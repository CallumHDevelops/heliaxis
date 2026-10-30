import { describe, expect, it } from 'vitest';
import { arrow, howItWorks, NODE_AT } from '@/lib/quotes/how-it-works';
import { mcsTable } from '@/lib/quotes/mcs';
import { cleanOption, DEFAULT_ABOUT, DEFAULT_SURVEY } from '@/lib/quotes/types';

describe('MCS table', () => {
  const o = cleanOption({ systemKwp: 6.44, orientationDeg: 90, tiltDeg: 44, postcodeRegion: '5W', kwhPerKwp: 734, shadeFactor: 0.916, annualGenerationKwh: 4330, occupancy: 'In Half Day', consumptionKwh: 3500, selfUsePvKwh: 1266, selfSufficiencyPvOnlyPct: 36.2, batteryUsableKwh: 24, selfUseBatteryKwh: 2468, selfSufficiencyPct: 71, eessUnusedKwh: 0.96, energyDischargedKwh: 17520, extraSelfUseKwh: 0 });
  it('has the five MCS sections and only what the design gave', () => {
    const t = mcsTable(o);
    expect(t.map((s) => s.title[0])).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(t[0].rows.find((r) => r.label.startsWith('Orientation'))?.value).toBe('East or west (90° from south)');
    expect(t[1].rows.find((r) => r.label === 'Shade factor')?.value).toBe('0.916');
    expect(mcsTable(cleanOption({ systemKwp: 4 })).map((s) => s.title[0])).toEqual(['A']);
  });
  it('keeps a negative orientation and nothing silly', () => {
    expect(cleanOption({ orientationDeg: -45 }).orientationDeg).toBe(-45);
    expect(cleanOption({ tiltDeg: -5 }).tiltDeg).toBeUndefined();
  });
});

describe('how it works', () => {
  it('shows the battery only when there is one, and the panels resting at night', () => {
    const withB = howItWorks(true);
    const without = howItWorks(false);
    expect(withB).toHaveLength(3);
    expect(withB[0].flows.some(([, to]) => to === 'battery')).toBe(true);
    expect(without.flatMap((s) => s.flows).some((f) => f.includes('battery'))).toBe(false);
    expect(withB[2].off).toEqual(['solar']);
  });
  it('draws each arrow between the edges of its two nodes', () => {
    const a = arrow('solar', 'home');
    expect(a.x1).toBeGreaterThan(NODE_AT.solar.x);
    expect(a.x2).toBeLessThan(NODE_AT.home.x);
    expect(a.y2).toBeGreaterThan(NODE_AT.home.y);
  });
});

describe('standard wording', () => {
  it('says what the survey checks, and that structural repairs are not included unless stated', () => {
    expect(DEFAULT_SURVEY).toMatch(/rafter size and spacing/);
    expect(DEFAULT_SURVEY).toMatch(/fire routes and means of escape/);
    expect(DEFAULT_SURVEY).toMatch(/not included unless this quote says so/);
    expect(DEFAULT_ABOUT).toMatch(/Newport/);
  });
});
