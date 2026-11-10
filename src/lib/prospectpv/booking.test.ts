import { describe, expect, it } from 'vitest';
import { SAMPLE_EXTRAS } from '@/lib/prospectpv/fixtures/sample';
import { availableExtras, moduleLimit, normaliseUkPhone, quote, validateBooking, type QuoteContext } from './booking';
import { SPEC_CALC_INPUTS } from './settings';

const ctx: QuoteContext = {
  packagePrice: 9000, baseBatteryKwh: 10, moduleKwh: 5, modulePrice: 2000, maxKwh: 30,
  extras: SAMPLE_EXTRAS, claims: ['ai_tariff', 'safety'],
};
const good = {
  code: '7KQ4M2XA', name: 'Alex Jones', phone: '07700 900123', email: 'Alex@Example.com', bestTime: 'Morning',
  consent: true, usageKwh: 3500, monthlyBill: 120, homePattern: 'some', extraModules: 1, extras: ['diverter'],
};

describe('quote', () => {
  it('adds modules and extras to the package price', () => {
    const q = quote(ctx, 2, ['ev_charger', 'diverter']);
    expect(q.total).toBe(9000 + 4000 + 1000 + 450);
    expect(q.batteryKwh).toBe(20);
    expect(q.diverter).toBe(true);
    expect(q.extras.map((e) => e.key)).toEqual(['ev_charger', 'diverter']);
  });

  it('caps modules at the system maximum and ignores tampered values', () => {
    expect(moduleLimit(ctx)).toBe(4);
    expect(quote(ctx, 99, []).batteryKwh).toBe(30);
    expect(quote(ctx, -3, []).total).toBe(9000);
    expect(quote(ctx, Number.NaN, []).total).toBe(9000);
  });

  it('ignores unknown or unpriced extras', () => {
    const c = { ...ctx, extras: [...SAMPLE_EXTRAS, { key: 'free', name: 'Free', description: null, price: null, effect: {} }] };
    expect(quote(c, 0, ['made_up', 'free']).total).toBe(9000);
  });

  it('hides whole-home backup when the package already includes backup', () => {
    expect(availableExtras(ctx).some((e) => e.key === 'backup')).toBe(true);
    expect(availableExtras({ ...ctx, claims: ['backup'] }).some((e) => e.key === 'backup')).toBe(false);
    expect(quote({ ...ctx, claims: ['backup'] }, 0, ['backup']).total).toBe(9000);
  });

  it('offers no modules while the module price or maximum is [TBC]', () => {
    expect(moduleLimit({ ...ctx, modulePrice: null })).toBe(0);
    expect(moduleLimit({ ...ctx, maxKwh: null })).toBe(0);
    expect(quote({ ...ctx, modulePrice: null }, 2, []).total).toBe(9000);
  });
});

describe('validateBooking', () => {
  it('accepts a complete booking and normalises it', () => {
    const r = validateBooking(good, SPEC_CALC_INPUTS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe('alex@example.com');
      expect(r.value.phone).toBe('07700900123');
    }
  });

  it('requires consent', () => {
    const r = validateBooking({ ...good, consent: false }, SPEC_CALC_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.consent).toMatch(/own the property/);
  });

  it('reports every bad field at once', () => {
    const r = validateBooking({ ...good, name: 'A', phone: '123', email: 'nope', bestTime: 'Midnight' }, SPEC_CALC_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['bestTime', 'email', 'name', 'phone']);
  });

  it('clamps calculator inputs to the slider ranges', () => {
    const r = validateBooking({ ...good, usageKwh: 999999, monthlyBill: 1 }, SPEC_CALC_INPUTS);
    expect(r.ok && r.value.usageKwh).toBe(10000);
    expect(r.ok && r.value.monthlyBill).toBe(30);
  });

  it('rejects junk', () => {
    expect(validateBooking(null, SPEC_CALC_INPUTS).ok).toBe(false);
    expect(validateBooking({ ...good, homePattern: 'sometimes' }, SPEC_CALC_INPUTS).ok).toBe(false);
  });
});

describe('UK phone numbers', () => {
  it.each([
    ['07700 900123', '07700900123'],
    ['+44 7700 900123', '07700900123'],
    ['01633 965205', '01633965205'],
    ['(01633) 965-205', '01633965205'],
  ])('%s → %s', (input, out) => expect(normaliseUkPhone(input)).toBe(out));
  it.each(['12345', '+1 202 555 0100', '0770090012345'])('rejects %s', (input) => expect(normaliseUkPhone(input)).toBeNull());
});
