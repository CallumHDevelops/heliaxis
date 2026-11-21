import { describe, expect, it } from 'vitest';
import { brandAlt, orderBrandLogos } from '@/lib/brand-logos';
import { liveNotices } from '@/app/(site)/solar-estimator/EstimatorExtras';
import { DEFAULT_SETTINGS } from '@/lib/estimator/calc';

describe('brand logos', () => {
  const cms = [
    { name: 'GivEnergy', img: 'data:a', bnr: true },
    { name: 'SolarEdge', img: '', bnr: true },
    { name: 'Fox ESS', img: '', bnr: false },
    { name: 'GoodWe', img: 'data:g', bnr: true },
  ];
  it('puts GoodWe first and keeps only the logos ticked for the banner', () => {
    const l = orderBrandLogos(cms);
    expect(l.map((x) => x.name)).toEqual(['GoodWe', 'GivEnergy', 'SolarEdge']);
    expect(l[0].img).toBe('data:g');
  });
  it('adds GoodWe, first, when the CMS does not have it', () => {
    expect(orderBrandLogos(cms.filter((x) => x.name !== 'GoodWe')).map((x) => x.name)).toEqual(['GoodWe', 'GivEnergy', 'SolarEdge']);
    expect(orderBrandLogos(undefined).map((x) => x.name)).toEqual(['GoodWe']);
  });
  it('every logo has real alt text', () => {
    for (const b of orderBrandLogos(cms)) expect(brandAlt(b)).toMatch(/\S+ logo$/);
  });
});

describe('why-now lines', () => {
  const n = DEFAULT_SETTINGS.notices;
  it('shows both before their dates, and the price-rise line says forecast and names its source', () => {
    const lines = liveNotices(n, new Date('2026-11-21T12:00:00Z'));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/forecast/i);
    expect(lines[1]).toMatch(/Cornwall Insight/);
  });
  it('hides the price-rise line after 25 November 2026 until a new one is entered', () => {
    expect(liveNotices(n, new Date('2026-11-25T23:00:00Z'))).toHaveLength(2);
    const after = liveNotices(n, new Date('2026-11-26T08:00:00Z'));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatch(/0% VAT/);
  });
  it('hides the VAT line after 31 March 2027', () => {
    expect(liveNotices({ ...n, priceRiseLine: '' }, new Date('2027-04-01T08:00:00Z'))).toEqual([]);
  });
});
