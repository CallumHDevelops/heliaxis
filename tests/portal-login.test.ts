import { describe, expect, it } from 'vitest';
import { looksLikePostcode, postcodeKey, surnameKey, surnameMatches } from '@/lib/crm/portal-login';

describe('portal sign-in with surname and postcode', () => {
  it('compares postcodes without spaces or case', () => {
    expect(postcodeKey(' np19 7az ')).toBe('NP197AZ');
    expect(looksLikePostcode('np19 7az')).toBe(true);
    expect(looksLikePostcode('CF3 6YL')).toBe(true);
    expect(looksLikePostcode('hello')).toBe(false);
  });
  it('matches the surname, ignoring case, spaces, apostrophes and accents', () => {
    expect(surnameMatches('Craig Preece', 'preece')).toBe(true);
    expect(surnameMatches('Sean O’Brien', "O'Brien")).toBe(true);
    expect(surnameMatches('Zoë Brontë', 'Bronte')).toBe(true);
    expect(surnameMatches('Jane van Dyke', 'van dyke')).toBe(true);
    expect(surnameMatches('Jane van Dyke', 'Dyke')).toBe(true);
  });
  it('never matches a first name or a single letter', () => {
    expect(surnameMatches('Craig Preece', 'Craig')).toBe(false);
    expect(surnameMatches('Craig Preece', 'P')).toBe(false);
    expect(surnameKey('')).toBe('');
  });
});
