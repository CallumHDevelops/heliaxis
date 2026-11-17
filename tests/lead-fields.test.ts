import { describe, expect, it } from 'vitest';
import { mapLeadFields } from '@/lib/whatsapp/leads';

const f = (name: string, v: string) => ({ name, values: [v] });

describe('Meta lead form answers', () => {
  it('takes the email and street address from custom questions', () => {
    const l = mapLeadFields([
      f('full_name', 'Mark Fenemore'),
      f('please_enter_the_best_number_to_reach_you_on:', '07545545377'),
      f('email_address', 'fencoat@hotmail.com'),
      f('street_address', 'Pen-y-lan Farm'),
      f('post_code', 'np15 1ex'),
      f('phone_number', '+447545545377'),
    ]);
    expect(l.email).toBe('fencoat@hotmail.com');
    expect(l.address).toBe('Pen-y-lan Farm');
    expect(l.postcode).toBe('NP15 1EX');
    expect(l.phone).toBe('+447545545377'); // the standard field wins
    expect(l.message).toContain('best number');
  });
  it('uses a custom number only when there is no standard phone', () => {
    expect(mapLeadFields([f('best_number_to_call_you_on', '07700 900123')]).phone).toBe('07700 900123');
    expect(mapLeadFields([f('best_number_to_call_you_on', 'evenings')]).phone).toBe('');
  });
  it('the standard email field still works, and a non-address "email" answer is not taken', () => {
    expect(mapLeadFields([f('email', 'a@b.co')]).email).toBe('a@b.co');
    expect(mapLeadFields([f('email_preference', 'weekly')]).email).toBe('');
  });
  it('adds the town to a street address', () => {
    expect(mapLeadFields([f('street_address', '5 High St'), f('city', 'Newport')]).address).toBe('5 High St, Newport');
  });
});
