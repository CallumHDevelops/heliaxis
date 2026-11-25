import { describe, expect, it } from 'vitest';
import { checkDesign, planStrings, stringLimits, type BatterySpec, type InverterSpec, type PanelSpec } from '@/lib/pvdesign/check';

// Illustrative figures for the tests only (not a real product).
const PANEL: PanelSpec = { wp: 400, voc: 37.4, vmp: 31.3, isc: 13.6, imp: 12.8, tempCoeffVocPct: -0.27 };
const INV: InverterSpec = { acKw: 6, maxDcV: 600, mpptMinV: 90, mpptMaxV: 520, mpptCount: 2, maxInputCurrentA: 16, maxIscA: 20, batteryMinV: 40, batteryMaxV: 60, offGridCapable: true, generatorInput: true };
const BAT: BatterySpec = { usableKwh: 16, nominalV: 51.2, maxChargeKw: 6, maxDischargeKw: 6 };
const codes = (r: ReturnType<typeof checkDesign>) => r.issues.map((i) => i.code);

describe('string limits (cold voltage, hot MPPT floor)', () => {
  it('corrects Voc for the cold and Vmp for the heat', () => {
    const l = stringLimits(PANEL, INV, -10, 70)!;
    expect(l.vocCold).toBeCloseTo(40.93, 1); // 37.4 x (1 + 0.0027 x 35)
    expect(l.maxLen).toBe(14); // floor(600 / 40.93)
    expect(l.minLen).toBe(4); // ceil(90 / 27.5)
    expect(l.maxParallel).toBe(1); // 20 A Isc limit / 13.6 A
  });
  it('a lower DC voltage limit shortens the longest string', () => {
    expect(stringLimits(PANEL, { ...INV, maxDcV: 450, mpptMaxV: 450 }, -10, 70)!.maxLen).toBe(10);
  });
  it('a colder design temperature never lengthens it', () => {
    expect(stringLimits(PANEL, INV, -25, 70)!.maxLen).toBeLessThanOrEqual(stringLimits(PANEL, INV, -10, 70)!.maxLen);
  });
  it('returns null when a needed figure is missing', () => {
    expect(stringLimits({ ...PANEL, voc: null }, INV, -10, 70)).toBeNull();
  });
});

describe('planStrings', () => {
  const lim = stringLimits(PANEL, INV, -10, 70)!;
  it('puts a short array on one MPPT and splits a long one evenly', () => {
    expect(planStrings(10, lim, 2)!.panelsPerString).toEqual([10]);
    expect(planStrings(16, lim, 2)!.panelsPerString).toEqual([8, 8]);
    expect(planStrings(17, lim, 2)!.panelsPerString).toEqual([9, 8]);
  });
  it('allows the most the MPPTs can hold and refuses one more', () => {
    expect(planStrings(28, lim, 2)!.panelsPerString).toEqual([14, 14]);
    expect(planStrings(29, lim, 2)).toBeNull();
  });
  it('refuses when there are too few panels for the MPPT minimum', () => {
    expect(planStrings(3, lim, 2)).toBeNull();
  });
});

describe('checkDesign', () => {
  it('flags a small array on a big inverter, plainly', () => {
    const r = checkDesign({ panel: PANEL, panelCount: 8, inverter: INV, systemType: 'grid-tied' });
    expect(r.metrics.kwp).toBe(3.2);
    expect(r.metrics.dcAcRatio).toBe(0.53);
    expect(codes(r)).toContain('dc_ac_low');
    expect(r.ok).toBe(true); // a warning, not a failure
    expect(r.issues.find((i) => i.code === 'dc_ac_low')!.fix).toMatch(/smaller inverter/);
  });
  it('passes a well-matched array', () => {
    const r = checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, systemType: 'grid-tied' });
    expect(r.ok).toBe(true);
    expect(codes(r)).not.toContain('dc_ac_low');
    expect(r.plan!.panelsPerString).toEqual([8, 8]);
  });
  it('fails when the panels cannot be wired, and offers the nearest counts that work', () => {
    const r = checkDesign({ panel: PANEL, panelCount: 30, inverter: INV, systemType: 'grid-tied' });
    expect(r.ok).toBe(false);
    expect(r.issues.find((x) => x.code === 'no_string_plan')!.fix).toMatch(/28 panels/);
  });
  it('never passes a design on a missing datasheet figure', () => {
    const r = checkDesign({ panel: { ...PANEL, voc: null }, panelCount: 10, inverter: INV, systemType: 'grid-tied' });
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.code === 'missing_spec')!.message).toMatch(/Voc/);
    expect(r.plan).toBeNull();
  });
  it('treats a missing temperature coefficient as missing', () => {
    expect(codes(checkDesign({ panel: { ...PANEL, tempCoeffVocPct: null }, panelCount: 10, inverter: INV, systemType: 'grid-tied' }))).toContain('missing_spec');
  });
  it('errors if the array is over the inverter PV maximum', () => {
    const r = checkDesign({ panel: PANEL, panelCount: 28, inverter: { ...INV, maxPvKw: 9 }, systemType: 'grid-tied' });
    expect(codes(r)).toContain('pv_over_max');
  });

  describe('battery', () => {
    it('errors on a battery outside the inverter voltage range', () => {
      const r = checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, battery: { ...BAT, nominalV: 400 }, systemType: 'grid-tied' });
      expect(codes(r)).toContain('battery_voltage');
      expect(r.ok).toBe(false);
    });
    it('warns when the battery cannot discharge as fast as the inverter', () => {
      const r = checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, battery: { ...BAT, maxDischargeKw: 3.3 }, systemType: 'grid-tied' });
      expect(codes(r)).toContain('battery_discharge_limit');
    });
  });

  describe('off-grid', () => {
    it('refuses an inverter not known to be off-grid capable (unknown is not yes)', () => {
      for (const v of [false, null]) {
        const r = checkDesign({ panel: PANEL, panelCount: 16, inverter: { ...INV, offGridCapable: v }, battery: BAT, systemType: 'off-grid', dailyLoadKwh: 8 });
        expect(codes(r)).toContain('not_off_grid');
        expect(r.ok).toBe(false);
      }
    });
    it('needs a generator input if a generator is wanted', () => {
      const r = checkDesign({ panel: PANEL, panelCount: 16, inverter: { ...INV, generatorInput: null }, battery: BAT, systemType: 'off-grid', dailyLoadKwh: 8, generatorBackup: true });
      expect(codes(r)).toContain('no_generator_input');
    });
    it('works out days of autonomy from the stated load, and flags a short one', () => {
      const ok = checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, battery: BAT, systemType: 'off-grid', dailyLoadKwh: 8 });
      expect(ok.metrics.autonomyDays).toBe(2);
      expect(ok.ok).toBe(true);
      const short = checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, battery: BAT, systemType: 'off-grid', dailyLoadKwh: 20 });
      expect(short.metrics.autonomyDays).toBe(0.8);
      expect(codes(short)).toContain('autonomy_low');
    });
    it('does not state autonomy without a load', () => {
      const r = checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, battery: BAT, systemType: 'off-grid' });
      expect(r.metrics.autonomyDays).toBeNull();
      expect(codes(r)).toContain('need_load');
    });
    it('multiplies capacity by the number of battery modules', () => {
      const r = checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, battery: { ...BAT, usableKwh: 5 }, batteryCount: 3, systemType: 'off-grid', dailyLoadKwh: 5 });
      expect(r.metrics.usableKwh).toBe(15);
      expect(r.metrics.autonomyDays).toBe(3);
    });
    it('errors without a battery, and when the peak load beats the inverter', () => {
      expect(codes(checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, systemType: 'off-grid', dailyLoadKwh: 8 }))).toContain('off_grid_no_battery');
      expect(codes(checkDesign({ panel: PANEL, panelCount: 16, inverter: INV, battery: BAT, systemType: 'off-grid', dailyLoadKwh: 8, peakLoadKw: 9 }))).toContain('peak_over_inverter');
    });
  });
});
