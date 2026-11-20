import { describe, expect, it } from 'vitest';
import { identifierMatches, looksLikePostcode, postcodeKey, projectRefMatches, serialEndMatches, serialsFrom, surnameMatches } from '@/lib/crm/portal-login';

describe('portal sign-in: postcode plus project number, surname or inverter serial', () => {
  it('compares postcodes without spaces or case', () => {
    expect(postcodeKey(' np19 7az ')).toBe('NP197AZ');
    expect(looksLikePostcode('cf3 6yl')).toBe(true);
    expect(looksLikePostcode('hello')).toBe(false);
  });
  it('takes the project number however it is typed', () => {
    expect(projectRefMatches('HX-0113', 'hx0113')).toBe(true);
    expect(projectRefMatches('HX-0113', 'HX 113')).toBe(true);
    expect(projectRefMatches('HX-0113', '0113')).toBe(true);
    expect(projectRefMatches('HX-0113', 'HX-0114')).toBe(false);
    expect(projectRefMatches(null, '113')).toBe(false);
  });
  it('matches the surname, never a first name', () => {
    expect(surnameMatches('Craig Rowland Preece', 'preece')).toBe(true);
    expect(surnameMatches('Sean O’Brien', "O'Brien")).toBe(true);
    expect(surnameMatches('Jane van Dyke', 'van dyke')).toBe(true);
    expect(surnameMatches('Craig Preece', 'Craig')).toBe(false);
    expect(surnameMatches('Preece', 'Preece')).toBe(false);
  });
  it('takes exactly the inverter serial’s last 6, ignoring case, spaces and dashes', () => {
    expect(serialEndMatches(['GW5K-DT 22A123456'], '123456')).toBe(true);
    expect(serialEndMatches(['GW5KDT22A123456'], '223456')).toBe(false);
    expect(serialEndMatches(['GW5KDT22A123456'], '3456')).toBe(false);
    expect(serialsFrom([{ s: 'ABC123456' }, { s: 'XYZ', unread: true }])).toEqual(['ABC123456']);
  });
  it('any one of the three opens it', () => {
    const job = { ref: 'HX-0113', name: 'Craig Preece', serials: ['GW5K22A4A7B21'] };
    expect(['HX-0113', 'Preece', '4a7b21'].map((t) => identifierMatches(job, t))).toEqual([true, true, true]);
    expect(identifierMatches(job, 'Smith')).toBe(false);
  });
});
