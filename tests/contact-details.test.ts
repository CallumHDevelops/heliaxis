import { describe, expect, it } from 'vitest';
import { betterName, extractContactDetails, tidyPostcode } from '@/lib/contact-details';

const david = `I have a couple of questions regarding my current system.

GW3600-ES-20 inverter: Whether it can safely accommodate one or two additional solar panels, taking account of PV voltage, current and string configuration.
LXU5.0-30 battery: Whether a second matching battery can be added and what equipment or configuration changes would be necessary.
Warranty: Whether either expansion would affect your existing manufacturer warranty.

Regards
David Bird
Is y Garn Pencaer Goodwick`;

describe('contact details in a message', () => {
  it('David: the surname and the address after the sign-off', () => {
    const d = extractContactDetails(david);
    expect(d.name).toBe('David Bird');
    expect(d.address).toBe('Is y Garn Pencaer Goodwick');
    expect(d.postcode).toBeUndefined(); // model numbers are not postcodes
  });
  it('a message that is only a postcode', () => {
    expect(extractContactDetails('SA64 0JQ')).toEqual({ postcode: 'SA64 0JQ' });
    expect(extractContactDetails('sa640jq')).toEqual({ postcode: 'SA64 0JQ' });
  });
  it('a multi-line address and the postcode inside it', () => {
    const d = extractContactDetails('Hi, solar quote please.\n\nKind regards,\nSarah Jones\n14 High Street\nNewport\nNP20 1AB\n07700 900123');
    expect(d.name).toBe('Sarah Jones');
    expect(d.address).toBe('14 High Street, Newport');
    expect(d.postcode).toBe('NP20 1AB');
  });
  it('says so in words', () => {
    expect(extractContactDetails("Hello, my name is Tom Evans and my email is tom@evans.co.uk. I live at 5 Mill Lane, Usk").name).toBe('Tom Evans');
    expect(extractContactDetails('My address is 5 Mill Lane, Usk').address).toBe('5 Mill Lane, Usk');
    expect(extractContactDetails('email me on Tom@Evans.co.uk').email).toBe('tom@evans.co.uk');
  });
  it('does not take a company, a product or a sentence for a name', () => {
    expect(extractContactDetails('Thanks\nHeliaxis Solar Team').name).toBeUndefined();
    expect(extractContactDetails('Regards\nPlease call me tomorrow').name).toBeUndefined();
    expect(extractContactDetails('Thank you for the quote').name).toBeUndefined();
  });
  it('tidies postcodes', () => {
    expect(tidyPostcode('np201ab')).toBe('NP20 1AB');
  });
});

describe('which name wins', () => {
  it('fills in the surname for the same first name', () => {
    expect(betterName('David', 'David Bird')).toBe('David Bird');
    expect(betterName('Mr Henry', 'Mr Henry Price')).toBeNull();
  });
  it('replaces a number or nothing', () => {
    expect(betterName('+447975598099', 'David Bird')).toBe('David Bird');
    expect(betterName('', 'David Bird')).toBe('David Bird');
  });
  it('never overwrites a different person or a full name', () => {
    expect(betterName('Sam', 'David Bird')).toBeNull();
    expect(betterName('David Bird', 'David Birdsall')).toBeNull();
    expect(betterName('David', 'David')).toBeNull();
  });
});
