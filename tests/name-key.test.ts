import { describe, expect, it } from 'vitest';
import { nameKey } from '@/lib/crm/name-key';

describe('name key', () => {
  it('treats the same person written differently as one', () => {
    expect(nameKey('Steve Ward')).toBe('steve ward');
    expect(nameKey('  Mr  STEVE   ward ')).toBe('steve ward');
    expect(nameKey('Siân O’Brien')).toBe('sian obrien');
    expect(nameKey('Mary-Jane Smith')).toBe('maryjane smith');
  });
  it('needs a first and a last name', () => {
    expect(nameKey('David')).toBeNull();
    expect(nameKey('Mr Henry')).toBeNull();
    expect(nameKey('')).toBeNull();
    expect(nameKey(null)).toBeNull();
  });
  it('leaves out placeholders and numbers', () => {
    expect(nameKey('Meta lead')).toBeNull();
    expect(nameKey('+44 7975 598099')).toBeNull();
    expect(nameKey('Unknown caller')).toBeNull();
  });
});
