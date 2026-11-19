import { describe, expect, it } from 'vitest';
import { allowedWarrantyYears, cleanFacts, DEFAULT_FACTS, factsGaps, fundingExpired, heldCredentials, ratingShown } from '@/lib/cms/facts';

describe('facts sheet', () => {
  it('is seeded only with confirmed facts, and states no rating or count it does not have', () => {
    expect(DEFAULT_FACTS.serviceArea).toBe('South Wales and the South West');
    expect(DEFAULT_FACTS.phone).toBe('01633 965205');
    expect(heldCredentials(DEFAULT_FACTS)).toEqual(['mcs', 'recc', 'napit', 'trustmark', 'ssip', 'iso 9001', 'iso 14001', 'eupd awarded installer 2026']);
    expect(heldCredentials(DEFAULT_FACTS)).not.toContain('niceic');
    expect(DEFAULT_FACTS.installCount).toBe('');
    expect(ratingShown(DEFAULT_FACTS)).toBe(false);
    expect(DEFAULT_FACTS.testimonials).toEqual([]);
    expect([...allowedWarrantyYears(DEFAULT_FACTS)].sort((a, b) => a - b)).toEqual([6, 7, 25, 30]);
  });

  it('shows a rating only when verified with its value and platform', () => {
    const f = (r: Partial<typeof DEFAULT_FACTS.rating>) => ({ ...DEFAULT_FACTS, rating: { ...DEFAULT_FACTS.rating, ...r } });
    expect(ratingShown(f({ value: '4.8', platform: 'Google' }))).toBe(false);
    expect(ratingShown(f({ value: '4.8', platform: 'Google', verified: true }))).toBe(true);
    expect(ratingShown(f({ verified: true }))).toBe(false);
  });

  it('lists what is still missing', () => {
    const gaps = factsGaps(DEFAULT_FACTS).join(' ');
    expect(gaps).toContain('No verified review rating');
    expect(gaps).toContain('No approved testimonials');
    expect(gaps).toContain('have not been checked');
  });

  it('knows when a funding route has ended', () => {
    const vat = DEFAULT_FACTS.funding[0];
    expect(fundingExpired(vat, '2027-03-31')).toBe(false);
    expect(fundingExpired(vat, '2027-04-01')).toBe(true);
    expect(fundingExpired({ ...vat, until: '' }, '2099-01-01')).toBe(false);
  });
});

describe('cleanFacts', () => {
  it('returns the seed for nothing, or for rubbish', () => {
    expect(cleanFacts(undefined)).toEqual(DEFAULT_FACTS);
    expect(cleanFacts('x')).toEqual(DEFAULT_FACTS);
    expect(cleanFacts(null).serviceArea).toBe(DEFAULT_FACTS.serviceArea);
  });

  it('keeps what was sent, within bounds', () => {
    const f = cleanFacts({
      serviceArea: '  Wales and the South West ',
      towns: ['Bath', ' Bath ', '', 'Bristol'],
      phone: '',
      rating: { value: '4.8', count: '120', platform: 'Google', verified: true },
      warranties: [{ label: 'Workmanship', years: '7', yearsMax: '3', by: 'Heliaxis' }, { label: '' }],
      funding: [{ name: 'Grant', until: 'soon', checkedOn: '2026-11-19', figures: ['£500', '£500', ''] }],
      testimonials: [{ name: 'A. Customer', quote: 'Tidy work.', town: 'Newport', product: 'Solar' }, { name: '', quote: 'x' }],
      imageApprovers: ['Cal@Heliaxis.co.uk', 'cal@heliaxis.co.uk'],
      updatedBy: 'x'.repeat(500),
    });
    expect(f.serviceArea).toBe('Wales and the South West');
    expect(f.towns).toEqual(['Bath', 'Bristol']);
    expect(f.phone).toBe(DEFAULT_FACTS.phone); // blank falls back: a page must always have a number
    expect(f.rating.verified).toBe(true);
    expect(f.warranties).toEqual([{ label: 'Workmanship', years: 7, yearsMax: 7, by: 'Heliaxis' }]);
    expect(f.funding).toHaveLength(1);
    expect(f.funding[0]).toMatchObject({ until: '', checkedOn: '2026-11-19', figures: ['£500'], audience: 'homes' });
    expect(f.testimonials).toHaveLength(1);
    expect(f.testimonials[0].id).toMatch(/^t-/);
    expect(f.imageApprovers).toEqual(['cal@heliaxis.co.uk']);
    expect(f.updatedBy.length).toBe(120);
  });

  it('only counts rating as verified for a real true', () => {
    expect(cleanFacts({ rating: { value: '5', platform: 'x', verified: 'true' } }).rating.verified).toBe(false);
  });
});
