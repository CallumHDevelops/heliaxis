import { describe, expect, it } from 'vitest';
import { cleanSettings, DEFAULT_SETTINGS, estimate, publicSettings, type Inputs } from '@/lib/estimator/calc';
import { chosenKey, kitLine, systemChoices } from '@/lib/estimator/choices';
import { parseQuoteInputs } from '@/lib/estimator/quote-input';
import { includedItems } from '@/lib/estimator/included';

const base: Inputs = { who: 'home', yieldKwhPerKwp: 950, shade: 'none', usage: { kind: 'bill', value: 120 }, daytime: 'some', battery: false, ev: false, heatpump: false };

describe('V4: the visitor’s own panel count', () => {
  it('uses the suggested size until the visitor changes it', () => {
    const e = estimate(base);
    expect(e.panels).toBe(e.panelsSuggested);
    expect(e.panelsMin).toBeLessThanOrEqual(e.panels);
    expect(e.panelsMax).toBeGreaterThanOrEqual(e.panels);
  });
  it('takes the chosen count, and the price and generation follow it', () => {
    const e = estimate(base);
    const more = estimate({ ...base, panels: e.panels + 2 });
    expect(more.panels).toBe(e.panels + 2);
    expect(more.generation).toBeGreaterThan(e.generation);
    expect(more.cost).toBeGreaterThan(e.cost);
  });
  it('never goes past what the roof takes, nor below the smallest system', () => {
    const roof = estimate({ ...base, maxPanels: 9, panels: 30 });
    expect(roof.panels).toBe(9);
    expect(roof.panelsMax).toBe(9);
    const tiny = estimate({ ...base, panels: 1 });
    expect(tiny.panels).toBe(tiny.panelsMin);
  });
  it('holds a single-phase home at the biggest inverter and says so', () => {
    const e = estimate({ ...base, panels: 40 });
    expect(e.panels).toBe(e.panelsMax);
    expect(e.phaseCapped).toBe(true);
  });
  it('gives the same answer from the browser’s price table as from the costs', () => {
    const own = { ...base, panels: 14, battery: true, batteryKwh: DEFAULT_SETTINGS.batteries.find((b) => b.active)!.kwh };
    const server = estimate(own, DEFAULT_SETTINGS);
    const browser = estimate(own, publicSettings(DEFAULT_SETTINGS));
    expect(browser.panels).toBe(server.panels);
    expect(Math.round(browser.cost)).toBe(Math.round(server.cost));
  });
  it('the quote form carries the panel count through to the server', () => {
    const q = parseQuoteInputs({ inputs: { ...base, panels: 12 } });
    expect(q?.inputs.panels).toBe(12);
    expect(parseQuoteInputs({ inputs: { ...base } })?.inputs.panels).toBeUndefined();
    expect(parseQuoteInputs({ inputs: { ...base, panels: 'x' } })?.inputs.panels).toBeUndefined();
  });
});

describe('V4: the systems to compare', () => {
  it('a home gets solar only plus one card per active battery, all with the same panels', () => {
    const list = systemChoices(base, DEFAULT_SETTINGS);
    const batteries = DEFAULT_SETTINGS.batteries.filter((b) => b.active);
    expect(list).toHaveLength(1 + batteries.length);
    expect(new Set(list.map((c) => c.e.panels)).size).toBe(1);
    expect(list.filter((c) => c.pick)).toHaveLength(1);
  });
  it('our pick is the one that saves the most over 25 years', () => {
    const list = systemChoices(base, DEFAULT_SETTINGS);
    const best = Math.max(...list.map((c) => c.e.net25));
    expect(list.find((c) => c.pick)!.e.net25).toBeCloseTo(best, 0);
  });
  it('a business gets its one system and no pick', () => {
    const list = systemChoices({ ...base, who: 'business', daytime: 'office' }, DEFAULT_SETTINGS);
    expect(list).toHaveLength(1);
    expect(list[0].pick).toBe(false);
  });
  it('knows which card the answers are showing', () => {
    const list = systemChoices(base, DEFAULT_SETTINGS);
    expect(chosenKey(base, estimate(base), list)).toBe('none');
    const kwh = list[1].kwh;
    const withBattery = { ...base, battery: true, batteryKwh: kwh };
    expect(chosenKey(withBattery, estimate(withBattery), list)).toBe(list[1].key);
  });
  it('names the panel model when there is one, otherwise the wattage', () => {
    const c = systemChoices(base, DEFAULT_SETTINGS)[0];
    expect(kitLine(c, '', 450)).toMatch(new RegExp(`^${c.e.panels} × 450 W panels`));
    expect(kitLine(c, 'Aiko Neostar 450 W', 450)).toMatch(/Aiko Neostar 450 W/);
  });
});

describe('V4: trust details in the settings', () => {
  it('starts with the MCS and NAPIT numbers and leaves the rest empty (hidden)', () => {
    const s = cleanSettings({});
    expect(s.accreditations.find((a) => a.name === 'MCS')?.number).toBe('NAP-82308');
    expect(s.accreditations.find((a) => a.name === 'RECC')?.number).toBe('');
  });
  it('keeps only https register links', () => {
    const s = cleanSettings({ accreditations: [{ name: 'MCS', number: '1', url: 'javascript:alert(1)' }, { name: '', number: '2' }] });
    expect(s.accreditations).toEqual([{ name: 'MCS', number: '1', url: '' }]);
  });
  it('the review line stays off without a real count and rating', () => {
    expect(cleanSettings({ reviews: { on: true, rating: 4.9, count: 0 } }).reviews.on).toBe(false);
    expect(cleanSettings({ reviews: { on: true, rating: 0, count: 12 } }).reviews.on).toBe(false);
    expect(cleanSettings({ reviews: { on: true, rating: 4.9, count: 12 } }).reviews.on).toBe(true);
  });
  it('the included list names the panel model when it is set', () => {
    expect(includedItems({ panels: 11, inverter: null, batteryName: null, scaffolding: true, workmanshipYears: 0, panelModel: 'Aiko Neostar 450 W' })).toContain('11 Aiko Neostar 450 W solar panels');
    expect(includedItems({ panels: 11, inverter: null, batteryName: null, scaffolding: true, workmanshipYears: 0 })).toContain('11 solar panels');
  });
});
