import { describe, expect, it } from 'vitest';
import { cleanSettings, DEFAULT_SETTINGS, estimate, publicSettings, type EstimatorSettings, type Inputs } from '@/lib/estimator/calc';
import { batteryOption, buildPriceTable, chooseInverter, costBuild, G98_LIMIT_KW, gridRouteFor, groupedLines, homePrice, marginMid, monthlyPayment, priced, type Inverter } from '@/lib/estimator/pricing';

const inv = (over: Partial<Inverter> & Pick<Inverter, 'acKw'>): Inverter => ({ id: `i${over.acKw}`, name: `Test ${over.acKw} kW`, phase: 'single', maxPvKwp: over.acKw * 1.5, hybrid: true, cost: 900, active: true, ...over });

/** The worked check: 450 W panels and one 5 kW hybrid at £900 (the placeholder), so the expected numbers come from the settings. */
const WORKED: EstimatorSettings = { ...DEFAULT_SETTINGS, panelWatts: 450, inverters: [inv({ acKw: 5, cost: 900 })] };
const c = WORKED.costs;

const base: Inputs = { who: 'home', yieldKwhPerKwp: 950, shade: 'none', usage: { kind: 'kwh', value: 3800 }, daytime: 'some', battery: false, ev: false, heatpump: false };

describe('cost build-up', () => {
  /** What a price should be, worked from the settings: cost / (1 - margin), never under cost + minimum profit. */
  const expected = (cost: number, margin: number) => Math.max(cost / (1 - margin / 100), cost + WORKED.minProfit);

  it('10 panels, no battery: the minimum profit sets the low price', () => {
    const l = costBuild(WORKED, 10, WORKED.inverters[0], null);
    const sum = 10 * c.panel + 10 * c.mounting + c.labourPerDay + c.electrical + c.admin + c.ancillaryPerWatt * 10 * WORKED.panelWatts + c.scaffolding + 900;
    expect(l.total).toBeCloseTo(sum, 2);
    expect(l.total).toBeCloseTo(5405, 2);
    const p = homePrice(WORKED, 10);
    expect(l.total / (1 - WORKED.marginLow / 100)).toBeCloseTo(7721, 0); // the margin alone would give this
    expect(p.low).toBeCloseTo(expected(l.total, WORKED.marginLow), 2);
    expect(Math.round(p.low)).toBe(7905);
    expect(p.floor.low).toBe(true);
    expect(Math.round(p.high)).toBe(8315);
    expect(p.floor.high).toBe(false);
  });
  it('10 panels with a 5 kWh battery: the margin sets both ends', () => {
    const p = homePrice(WORKED, 10, { batteryKwh: 5 });
    expect(p.cost).toBeCloseTo(5405 + WORKED.batteries.find((b) => b.kwh === 5)!.cost, 2);
    expect(Math.round(p.low)).toBe(9293);
    expect(Math.round(p.high)).toBe(10008);
    expect(p.floor.low).toBe(false);
  });
  it('16 panels with an 8.3 kWh battery on a 6 kW hybrid', () => {
    const s6 = { ...WORKED, inverters: [inv({ acKw: 6, cost: 1000 })] };
    const p = homePrice(s6, 16, { batteryKwh: 8.3 });
    expect(p.cost).toBeCloseTo(7818, 2);
    expect(Math.round(p.low)).toBe(11169);
    expect(Math.round(p.high)).toBe(12028);
    expect(p.low).toBeCloseTo(expected(p.cost, s6.marginLow), 2);
  });
  it('the minimum profit applies to low, middle and high separately', () => {
    const cheap = { ...WORKED, minProfit: 3000 };
    const p = homePrice(cheap, 10);
    expect(p.low).toBeCloseTo(p.cost + 3000, 2);
    expect(p.mid).toBeCloseTo(priced(p.cost, marginMid(cheap), 3000), 2);
    expect(p.high).toBeCloseTo(Math.max(p.cost / (1 - cheap.marginHigh / 100), p.cost + 3000), 2);
    expect(homePrice({ ...WORKED, minProfit: 0 }, 10).low).toBeCloseTo(5405 / 0.7, 2);
  });
  it('fitting labour is a day per panelsPerDay, never less than one day', () => {
    expect(costBuild(WORKED, 1, null, null).labour).toBe(c.labourPerDay);
    expect(costBuild(WORKED, c.panelsPerDay, null, null).labour).toBe(c.labourPerDay);
    expect(costBuild(WORKED, c.panelsPerDay + 1, null, null).labour).toBe(c.labourPerDay * 2);
  });
  it('scaffolding can be switched off', () => {
    const off = { ...WORKED, costs: { ...c, scaffoldingOn: false } };
    expect(costBuild(off, 10, null, null).scaffolding).toBe(0);
    expect(costBuild(off, 10, null, null).total).toBeCloseTo(costBuild(WORKED, 10, null, null).total - c.scaffolding, 2);
  });
  it('the price range is ordered low, mid, high, with the middle margin halfway', () => {
    const p = homePrice(DEFAULT_SETTINGS, 16, { batteryKwh: 8.3 });
    expect(p.low).toBeLessThan(p.mid);
    expect(p.mid).toBeLessThan(p.high);
    expect(marginMid(DEFAULT_SETTINGS)).toBe(32.5);
    expect(p.mid).toBeCloseTo(p.cost / (1 - 0.325), 2);
  });
});

describe('inverter sizing', () => {
  const s = DEFAULT_SETTINGS;
  it('picks the smallest hybrid whose AC rating times 1.35 takes the array', () => {
    expect(chooseInverter(s, 4.5).inverter?.acKw).toBe(3.6); // 3.6 x 1.35 = 4.86
    expect(chooseInverter(s, 4.9).inverter?.acKw).toBe(5); // 5 x 1.35 = 6.75
    expect(chooseInverter(s, 7).inverter?.acKw).toBe(6); // 6 x 1.35 = 8.1
  });
  it('a single-phase supply takes no more than the 6 kW inverter: the array is capped', () => {
    const r = chooseInverter(s, 9.5);
    expect(r.fits).toBe(false);
    expect(r.capKwp).toBeCloseTo(8.1, 5);
    expect(chooseInverter(s, 9.5, { phase: 'three' }).inverter?.acKw).toBe(10);
  });
  it('respects the inverter’s own input limit', () => {
    const tight = { ...s, inverters: [inv({ acKw: 5, maxPvKwp: 5.5 }), inv({ acKw: 6, maxPvKwp: 9 })] };
    expect(chooseInverter(tight, 6).inverter?.acKw).toBe(6);
  });
  it('with a battery, never an inverter below 85% of what the battery needs', () => {
    const need = (kwh: number) => kwh * s.batteryKwPerKwh * 0.85;
    const r = chooseInverter(s, 3, { batteryKwh: 8.3 });
    expect(r.inverter!.acKw).toBeGreaterThanOrEqual(need(8.3));
    const big = { ...s, batteryKwPerKwh: 1 };
    expect(chooseInverter(big, 3, { batteryKwh: 8.3, phase: 'three' }).inverter!.acKw).toBeGreaterThanOrEqual(8.3 * 0.85);
    expect(chooseInverter({ ...s, batteryKwPerKwh: 0 }, 3, { batteryKwh: 8.3 }).inverter?.acKw).toBe(3.6);
  });
  it('is hybrid on homes unless solar-only is switched on', () => {
    const mixed = { ...s, inverters: [inv({ acKw: 3.6, hybrid: false, cost: 500 }), inv({ acKw: 5, hybrid: true })] };
    expect(chooseInverter(mixed, 3).inverter?.hybrid).toBe(true);
    expect(chooseInverter({ ...mixed, solarOnlyInverter: true }, 3).inverter?.hybrid).toBe(false);
    expect(chooseInverter({ ...mixed, solarOnlyInverter: true }, 3, { batteryKwh: 5 }).inverter?.hybrid).toBe(true);
  });
  it('G98 up to and including 3.68 kW AC, G99 above (set from the inverter, not the array)', () => {
    expect(G98_LIMIT_KW).toBe(3.68);
    expect(gridRouteFor(3.6)).toBe('G98');
    expect(gridRouteFor(3.68)).toBe('G98');
    expect(gridRouteFor(3.69)).toBe('G99');
    expect(gridRouteFor(5)).toBe('G99');
    // A 4.5 kWp array on the 3.6 kW inverter is still a G98 job.
    const e = estimate({ ...base, usage: { kind: 'kwh', value: 3800 } }, DEFAULT_SETTINGS);
    expect(e.kwp).toBeGreaterThan(3.68);
    expect(e.acKw).toBe(3.6);
    expect(e.gridRoute).toBe('G98');
    expect(e.needsG99).toBe(false);
  });
});

describe('the estimate uses the cost model for homes', () => {
  it('prices from the cost build-up, with the margin range and the chosen inverter', () => {
    const e = estimate(base, DEFAULT_SETTINGS);
    expect(e.pricing).toBe('costModel');
    const p = homePrice(DEFAULT_SETTINGS, e.panels);
    expect(e.costLow).toBeCloseTo(p.low, 2);
    expect(e.costHigh).toBeCloseTo(p.high, 2);
    expect(e.cost).toBeCloseTo(p.mid, 2);
    expect(e.inverter).toBe(p.inverter!.name);
  });
  it('a battery adds its option’s price and the nearest size is used', () => {
    const a = estimate(base, DEFAULT_SETTINGS);
    const b = estimate({ ...base, battery: true, batteryKwh: 8.3 }, DEFAULT_SETTINGS);
    expect(b.batteryKwh).toBe(8.3);
    expect(b.cost - a.cost).toBeGreaterThan(1500 * 1.3 - 1);
    expect(batteryOption(DEFAULT_SETTINGS, 8)?.kwh).toBe(8.3);
  });
  it('a three-phase supply lifts the single-phase cap', () => {
    const huge = { ...base, usage: { kind: 'kwh' as const, value: 20000 } };
    const one = estimate(huge, DEFAULT_SETTINGS);
    const three = estimate({ ...huge, phase: 'three' }, DEFAULT_SETTINGS);
    expect(one.phaseCapped).toBe(true);
    expect(one.kwp).toBeLessThanOrEqual(8.1 + 1e-9);
    expect(three.kwp).toBeGreaterThan(one.kwp);
    expect(three.phaseCapped).toBe(false);
    expect(three.acKw).toBe(10);
  });
  it('a package set to bands keeps its hand-typed price list', () => {
    const s = cleanSettings({ packages: [{ name: 'Promo', kind: 'solar', pricing: 'bands', bands: [{ panels: 4, price: 4000 }, { panels: 40, price: 22000 }] }] });
    const e = estimate(base, s);
    expect(e.pricing).toBe('bands');
    expect(e.packageName).toBe('Promo');
  });
  it('businesses still use the fixed cost plus price per kWp', () => {
    const e = estimate({ ...base, who: 'business', daytime: 'office' }, DEFAULT_SETTINGS);
    expect(e.pricing).toBe('formula');
    expect(e.cost).toBeCloseTo(DEFAULT_SETTINGS.businessFixed + e.kwp * DEFAULT_SETTINGS.businessPerKwp, 2);
    expect(e.inverter).toBeNull();
  });
  it('the browser’s copy carries no costs and prices the same as the full settings', () => {
    const pub = publicSettings(DEFAULT_SETTINGS);
    expect(JSON.stringify(pub)).not.toMatch(/"cost":(?!0[,}])\d/);
    expect(pub.costs.panel).toBe(0);
    expect(pub.inverters).toEqual([]);
    for (const input of [base, { ...base, battery: true }, { ...base, battery: true, batteryKwh: 8.3 }, { ...base, phase: 'three' as const, usage: { kind: 'kwh' as const, value: 15000 } }]) {
      const a = estimate(input, DEFAULT_SETTINGS);
      const b = estimate(input, pub);
      expect(b.costLow).toBeCloseTo(a.costLow, 6);
      expect(b.costHigh).toBeCloseTo(a.costHigh, 6);
      expect(b.cost).toBeCloseTo(a.cost, 6);
      expect(b.inverter).toBe(a.inverter);
      expect(b.panels).toBe(a.panels);
    }
  });
  it('the price table covers each supply and battery size', () => {
    const t = buildPriceTable(DEFAULT_SETTINGS);
    expect(Object.keys(t.rows).sort()).toEqual(['single:0', 'single:5', 'single:8.3', 'three:0', 'three:5', 'three:8.3']);
    expect(t.rows['single:0'][10]!.low).toBeCloseTo(homePrice(DEFAULT_SETTINGS, 10).low, 6);
  });
});

describe('grouped lines for the quote', () => {
  it('add up exactly to the headline mid price, with no raw costs in the labels', () => {
    for (const [panels, kwh] of [[10, 0], [10, 5], [14, 8.3], [7, 0], [18, 5]] as const) {
      const p = homePrice(DEFAULT_SETTINGS, panels, { batteryKwh: kwh });
      const headline = Math.round(p.mid);
      const lines = groupedLines(p.lines, p.battery?.name ?? null, headline);
      expect(lines.reduce((a, b) => a + b.price, 0)).toBe(headline);
      expect(lines.some((l) => l.key === 'battery')).toBe(kwh > 0);
      expect(lines.every((l) => Number.isInteger(l.price))).toBe(true);
    }
  });
});

describe('settings', () => {
  it('seeds the placeholder inverters, batteries, margins and notices; award and finance are off', () => {
    const s = cleanSettings({});
    expect(s.inverters.map((i) => i.cost)).toEqual([750, 900, 1000, 1400]);
    expect(s.batteries.map((b) => [b.kwh, b.cost])).toEqual([[5, 1100], [8.3, 1500]]);
    expect([s.marginLow, s.marginHigh, s.minProfit]).toEqual([30, 35, 2500]);
    expect(s.award.on).toBe(false);
    expect(s.finance.askOn).toBe(false);
    expect(s.finance.figuresOn).toBe(false);
    expect(s.notices.priceRiseLine).toMatch(/forecast/);
    expect(s.notices.priceRiseLine).toMatch(/Cornwall Insight/);
    expect(s.notices.priceRiseExpires).toBe('2026-11-25');
  });
  it('the award cannot be switched on without its wording', () => {
    expect(cleanSettings({ award: { on: true, wording: '' } }).award.on).toBe(false);
    expect(cleanSettings({ award: { on: true, wording: 'The exact wording' } }).award.on).toBe(true);
  });
  it('finance figures need a rate', () => {
    expect(cleanSettings({ finance: { figuresOn: true, aprPct: 0 } }).finance.figuresOn).toBe(false);
    expect(monthlyPayment(6000, 0, 10)).toBeCloseTo(50, 5);
    expect(monthlyPayment(6000, 9.9, 10)).toBeGreaterThan(50);
  });
});
