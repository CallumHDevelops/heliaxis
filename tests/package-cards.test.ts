import { describe, expect, it } from 'vitest';
import type { Package } from '@/lib/estimator/calc';
import { packageCards } from '@/lib/estimator/package-cards';

const pkg = (o: Partial<Package>): Package => ({
  id: 'p',
  kind: 'solar',
  name: 'Solar only',
  summary: 'Panels and inverter',
  includes: ['Panels', ' ', 'Inverter'],
  active: true,
  batteryKwh: 0,
  bands: [],
  ...o,
});

describe('packageCards', () => {
  it('is empty with no packages, or when none active has prices', () => {
    expect(packageCards([])).toEqual([]);
    expect(packageCards([pkg({})])).toEqual([]);
    expect(packageCards([pkg({ active: false, bands: [{ panels: 8, price: 5000 }] })])).toEqual([]);
  });

  it('gives the lowest price and the panel range', () => {
    const [c] = packageCards([pkg({ bands: [{ panels: 16, price: 9800 }, { panels: 8, price: 6450 }] })]);
    expect(c.fromPrice).toBe('From £6,450 fitted');
    expect(c.sizeLine).toBe('8 to 16 panels');
    expect(c.includes).toEqual(['Panels', 'Inverter']);
  });

  it('shows an active package without prices, with no price line', () => {
    const cards = packageCards([pkg({ id: 'a', bands: [{ panels: 10, price: 7000 }] }), pkg({ id: 'b', name: 'Solar and battery' })]);
    expect(cards).toHaveLength(2);
    expect(cards[0].sizeLine).toBe('10 panels');
    expect(cards[1].fromPrice).toBeNull();
    expect(cards[1].sizeLine).toBeNull();
  });
});
