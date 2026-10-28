import { describe, expect, it } from 'vitest';
import { distanceM, inUk, mapsUrl, metresWords } from '@/lib/booking/location';
import { dateWords, smsText, whatsappText } from '@/lib/booking/appointment-text';
import { appointmentEmail } from '@/lib/booking/appointment-email';
import { toMsisdn } from '@/lib/sms';

describe('the pin', () => {
  it('measures how far it was moved', () => {
    const a = { lat: 51.5852, lng: -2.7196 };
    expect(distanceM(a, a)).toBe(0);
    // About 0.001 degrees of latitude is 111 m.
    expect(distanceM(a, { lat: 51.5862, lng: -2.7196 })).toBeGreaterThan(105);
    expect(distanceM(a, { lat: 51.5862, lng: -2.7196 })).toBeLessThan(117);
    expect(metresWords(35.4)).toBe('35 m');
    expect(metresWords(1240)).toBe('1.2 km');
  });
  it('accepts only places in the UK', () => {
    expect(inUk(51.58, -2.72)).toBe(true);
    expect(inUk(40.7, -74)).toBe(false);
    expect(inUk(NaN, 0)).toBe(false);
  });
  it('makes a Google Maps link from the point, else the address', () => {
    expect(mapsUrl({ lat: 51.5852055, lng: -2.7196585 })).toBe('https://www.google.com/maps/search/?api=1&query=51.585206,-2.719658');
    expect(mapsUrl({ address: '2 Marine Terrace', postcode: 'NP26 5ST' })).toBe('https://www.google.com/maps/search/?api=1&query=2%20Marine%20Terrace%2C%20NP26%205ST');
    expect(mapsUrl({})).toBeNull();
  });
});

describe('text messages', () => {
  it('turns UK mobiles into the number a text service wants', () => {
    expect(toMsisdn('07700 900123')).toBe('447700900123');
    expect(toMsisdn('+44 7700 900123')).toBe('447700900123');
    expect(toMsisdn('0044 7700 900123')).toBe('447700900123');
    expect(toMsisdn('447700900123')).toBe('447700900123');
    expect(toMsisdn('01633 965205')).toBeNull();
    expect(toMsisdn('')).toBeNull();
  });
});

describe('appointment messages', () => {
  const when = Date.UTC(2026, 10, 3, 10, 45); // Tuesday 3 November 2026, 10:45 GMT
  it('says the day and time in UK words', () => {
    expect(dateWords(when)).toEqual({ date: 'Tuesday 3 November', time: '10:45' });
    // In summer the UK is an hour ahead of UTC.
    expect(dateWords(Date.UTC(2026, 6, 7, 9, 0)).time).toBe('10:00');
  });
  it('is the wording asked for, with the pin link', () => {
    const w = { first: 'Andy', date: 'Tuesday 3 November', time: '10:45', link: 'https://heliaxis.co.uk/where/abc', me: 'Callum' };
    const wa = whatsappText(w);
    expect(wa).toContain('Hi Andy, thank you for your time. I look forward to meeting you on Tuesday 3 November at 10:45.');
    expect(wa).toContain('check the pin location at the link below and confirm');
    expect(wa).toContain('https://heliaxis.co.uk/where/abc');
    expect(wa).toContain('Callum, Heliaxis');
    expect(smsText(w).length).toBeLessThanOrEqual(320);
  });
  it('puts a check-the-pin button in the email', () => {
    const m = appointmentEmail({ name: 'Andy Jones', title: 'Solar survey', startMs: when, endMs: when + 3_600_000, address: '1 High St', postcode: 'NP20 4AB', who: 'Callum', uid: 'x', locationUrl: 'https://heliaxis.co.uk/where/abc' });
    expect(m.html).toContain('Check the pin on the map');
    expect(m.html).toContain('https://heliaxis.co.uk/where/abc');
    expect(m.text).toContain('https://heliaxis.co.uk/where/abc');
  });
});
