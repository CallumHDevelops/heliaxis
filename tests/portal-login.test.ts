import { describe, expect, it } from 'vitest';
import { looksLikePostcode, looksLikeSerialEnd, postcodeKey, serialEndMatches, serialsFrom } from '@/lib/crm/portal-login';

describe('portal sign-in with the inverter serial and postcode', () => {
  it('compares postcodes without spaces or case', () => {
    expect(postcodeKey(' np19 7az ')).toBe('NP197AZ');
    expect(looksLikePostcode('cf3 6yl')).toBe(true);
    expect(looksLikePostcode('hello')).toBe(false);
  });
  it('takes exactly the last 6 characters, ignoring case, spaces and dashes', () => {
    expect(looksLikeSerialEnd('a1b2-c3')).toBe(true);
    expect(looksLikeSerialEnd('12345')).toBe(false);
    expect(serialEndMatches(['GW5K-DT 22A123456'], '123456')).toBe(true);
    expect(serialEndMatches(['gw5kdt22a1b2c3'], 'A1B2C3')).toBe(true);
    expect(serialEndMatches(['GW5KDT22A123456'], '223456')).toBe(false);
    expect(serialEndMatches([null, ''], '123456')).toBe(false);
  });
  it('reads scanned captures (skipping unread ones) and typed serials', () => {
    expect(serialsFrom([{ s: 'ABC123456' }, { s: 'XYZ', unread: true }])).toEqual(['ABC123456']);
    expect(serialsFrom('ABC123456')).toEqual(['ABC123456']);
    expect(serialsFrom(undefined)).toEqual([]);
  });
});
