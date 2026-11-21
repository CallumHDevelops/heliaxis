import { describe, expect, it } from 'vitest';
import { buildConsent, CONSENT_VERSION, CONSENT_WORDING, makeReference, normaliseUkMobile, ownImagePath, parseQuoteInputs, REFERENCE_PATTERN, validEmail } from '@/lib/estimator/quote-input';
import { includedItems } from '@/lib/estimator/included';

describe('quote form input', () => {
  const good = { inputs: { who: 'home', yieldKwhPerKwp: 950, shade: 'some', usage: { kind: 'bill', value: 120 }, daytime: 'out', battery: true, batteryKwh: 8.3, ev: false, heatpump: true, phase: 'three' }, imp: 26, exp: 12 };
  it('reads the answers and clamps what a browser could send', () => {
    const p = parseQuoteInputs(good)!;
    expect(p.inputs.who).toBe('home');
    expect(p.inputs.batteryKwh).toBe(8.3);
    expect(p.inputs.phase).toBe('three');
    const wild = parseQuoteInputs({ inputs: { who: 'home', yieldKwhPerKwp: 9e9, usage: { kind: 'kwh', value: -5 }, battery: true, batteryKwh: 999, shade: 'x', daytime: 'x', phase: 'x' }, imp: 1e9, exp: -3 })!;
    expect(wild.inputs.yieldKwhPerKwp).toBe(1500);
    expect(wild.inputs.usage.value).toBe(0);
    expect(wild.inputs.batteryKwh).toBe(30);
    expect(wild.inputs.shade).toBe('none');
    expect(wild.inputs.phase).toBe('unknown');
    expect(wild.imp).toBe(100);
    expect(wild.exp).toBe(0);
  });
  it('carries no price: whatever the browser sends as a cost is ignored', () => {
    const p = parseQuoteInputs({ ...good, inputs: { ...good.inputs, cost: 1, costLow: 1, price: 1 } })!;
    expect(JSON.stringify(p)).not.toMatch(/cost|price/);
  });
  it('rejects things that are not an estimate', () => {
    expect(parseQuoteInputs(null)).toBeNull();
    expect(parseQuoteInputs({})).toBeNull();
    expect(parseQuoteInputs({ inputs: { who: 'martian' } })).toBeNull();
  });
  it('normalises UK mobiles to 447…', () => {
    expect(normaliseUkMobile('07700 900123')).toBe('447700900123');
    expect(normaliseUkMobile('+44 7700 900123')).toBe('447700900123');
    expect(normaliseUkMobile('0044 7700 900123')).toBe('447700900123');
    expect(normaliseUkMobile('01633 965205')).toBeNull();
    expect(normaliseUkMobile('')).toBeNull();
  });
  it('checks emails', () => {
    expect(validEmail('a@b.co')).toBe(true);
    expect(validEmail('a@b')).toBe(false);
    expect(validEmail('a b@c.com')).toBe(false);
  });
  it('makes references with no look-alike characters', () => {
    const r = makeReference((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(r).toMatch(REFERENCE_PATTERN);
    expect(makeReference((n) => new Uint8Array(n).fill(255))).toMatch(REFERENCE_PATTERN);
  });
  it('accepts only our own signed roof picture links', () => {
    expect(ownImagePath('/api/solar/image?lat=51.584000&lng=-2.997000&sig=0123456789abcdef0123')).not.toBeNull();
    expect(ownImagePath('https://evil.example/x.png')).toBeNull();
    expect(ownImagePath('/api/solar/image?lat=1.0&lng=2.0&sig=nothex')).toBeNull();
  });
});

describe('consent record', () => {
  it('stores what they agreed to, when, and the exact words shown', () => {
    const at = new Date('2026-11-21T10:00:00Z');
    const c = buildConsent('both', true, false, at);
    expect(c).toMatchObject({ version: CONSENT_VERSION, at: '2026-11-21T10:00:00.000Z', delivery: 'both', emailFollowUps: true, whatsappMarketing: false });
    expect(c.wording).toEqual(CONSENT_WORDING);
    expect(CONSENT_WORDING.emailFollowUps).toMatch(/Untick/);
  });
  it('WhatsApp marketing is a separate yes from the quote itself', () => {
    expect(buildConsent('whatsapp', true, false).whatsappMarketing).toBe(false);
    expect(buildConsent('whatsapp', false, true).whatsappMarketing).toBe(true);
  });
});

describe('what is included', () => {
  const a = { panels: 10, inverter: 'GoodWe 5 kW hybrid inverter', batteryName: null, scaffolding: true, workmanshipYears: 0 };
  it('lists the standard items, a battery only when chosen, a warranty term only when set', () => {
    const base = includedItems(a);
    expect(base[0]).toBe('GoodWe 5 kW hybrid inverter');
    expect(base).toContain('10 solar panels');
    expect(base.some((x) => /battery/i.test(x))).toBe(false);
    expect(base.some((x) => /year workmanship/.test(x))).toBe(false);
    expect(includedItems({ ...a, batteryName: 'GoodWe 5 kWh battery', workmanshipYears: 10 })).toEqual(expect.arrayContaining(['GoodWe 5 kWh battery', '10-year workmanship warranty']));
    expect(includedItems({ ...a, scaffolding: false })).not.toContain('Scaffolding');
  });
  it('uses the package’s own list when it has one', () => {
    expect(includedItems({ ...a, packageIncludes: ['One', ' ', 'Two'] })).toEqual(['One', 'Two']);
  });
});
