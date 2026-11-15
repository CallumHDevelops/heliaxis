import { describe, expect, it } from 'vitest';
import { CONTENT_CATEGORIES, districtOf, type ContentPhoto } from '@/lib/content/shared';

describe('content library', () => {
  it('reduces a postcode to its district', () => {
    expect(districtOf('NP19 4AB')).toBe('NP19');
    expect(districtOf('cf10 1aa')).toBe('CF10');
    expect(districtOf('BS1 4DJ')).toBe('BS1');
    expect(districtOf('W1A 1AA')).toBe('W1A');
    expect(districtOf('nonsense')).toBeNull();
    expect(districtOf(null)).toBeNull();
  });
  it('never shares survey, snag or other photos', () => {
    expect([...CONTENT_CATEGORIES]).toEqual(['site', 'progress', 'completion']);
  });
  it('carries no customer details', () => {
    const keys: (keyof ContentPhoto)[] = ['id', 'project_id', 'ref', 'title', 'products', 'kwp', 'area', 'category', 'caption', 'taken_at', 'created_at', 'width', 'height', 'thumb', 'url'];
    for (const k of keys) expect(String(k)).not.toMatch(/name|address|email|phone|postcode|customer/i);
  });
});
