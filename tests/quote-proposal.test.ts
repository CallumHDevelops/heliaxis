import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { factsText, glanceRows } from '@/lib/quotes/proposal';
import { includedByRule } from '@/lib/quotes/included';
import { cleanContent, cleanOption, starterContent } from '@/lib/quotes/types';

const OPT = cleanOption({
  name: 'GoodWe 24kWh BESS', systemKwp: 6.44, panelCount: 14, panelWatts: 460, panelBrand: 'Astronergy', panelModel: 'CHSM48RN(DG)(BLH)/F-BH-460',
  panelProductWarrantyYears: 25, panelPerformanceWarrantyYears: 30, inverterBrand: 'GoodWe', inverterModel: 'GW8K-EHA-G20', inverterCount: 1, inverterKw: 8, inverterWarrantyYears: 10,
  batteryBrand: 'GoodWe', batteryModel: 'GW8.3-BAT-D-G21', batteryModules: 3, batteryUsableKwh: 24, batteryWarrantyYears: 10, annualGenerationKwh: 4330, annualSavingsGbp: 962, paybackText: '9 Years 6 Months',
});

describe('design proposal figures', () => {
  it('keeps only sensible values', () => {
    expect(cleanOption({ systemKwp: -3, panelCount: 'abc', panelBrand: '  Astronergy  ', junk: 1 })).toEqual({ panelBrand: 'Astronergy' });
  });
  it('makes plain facts for the writers, with savings only when allowed', () => {
    const t = factsText(OPT);
    expect(t).toContain('Solar array: 6.44 kWp, 14 panels of 460 W (Astronergy CHSM48RN(DG)(BLH)/F-BH-460).');
    expect(t).toContain('Inverter: GoodWe GW8K-EHA-G20, 8 kW.');
    expect(t).toContain('Battery: 24 kWh usable capacity, 3 × GoodWe GW8.3-BAT-D-G21.');
    expect(t).toContain('25-year panel product warranty, 30-year panel performance warranty, 10-year inverter product warranty, 10-year battery product warranty');
    expect(t).not.toContain('£');
    expect(factsText(OPT, true)).toContain('Estimated annual bill saving: £962.');
  });
  it('makes the cover rows, hiding savings and payback unless asked', () => {
    expect(glanceRows(OPT).map((r) => r.label)).toEqual(['System size', 'Solar panels', 'Inverter', 'Battery storage', 'Estimated generation', 'Manufacturer warranties']);
    expect(glanceRows(OPT, true).map((r) => r.label)).toContain('Estimated payback');
  });
  it('is kept with the quote, and its warranties go into What is included', () => {
    const c = cleanContent({ ...starterContent('Sam'), proposal: { file: 'p.pdf', options: [OPT, {}], chosen: 5, showFinancials: true } });
    expect(c.proposal?.options).toHaveLength(1);
    expect(c.proposal?.chosen).toBe(0);
    const b = c.blocks[0];
    if (b.type !== 'items') throw new Error('items');
    b.lines = [{ id: '1', description: 'Astronergy 460W panels', qty: 14, unit_pence: 1, vat_rate: 0, cost_pence: 0, mode: 'manual', markup: 0 }];
    expect(includedByRule(c)).toContain('manufacturer’s warranties: a 25-year product warranty and a 30-year performance warranty on the solar panels, a 10-year warranty on the inverter and a 10-year warranty on the battery.');
  });
});
