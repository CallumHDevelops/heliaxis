import { describe, expect, it } from 'vitest';
import { HOME_TITLE, withoutBrand } from '@/lib/seo/title';

describe('withoutBrand', () => {
  it('drops a trailing brand however it was typed', () => {
    expect(withoutBrand('Home Page — Heliaxis')).toBe('Home Page');
    expect(withoutBrand('Solar Panel Installation South Wales | Heliaxis')).toBe('Solar Panel Installation South Wales');
    expect(withoutBrand('The Congress Theatre | Heliaxis | Heliaxis')).toBe('The Congress Theatre');
    expect(withoutBrand('Off-grid - Heliaxis Ltd')).toBe('Off-grid');
  });
  it('keeps the brand when it is not at the end', () => {
    expect(withoutBrand('Why Heliaxis for solar')).toBe('Why Heliaxis for solar');
  });
  it('keeps the home title within 60 characters', () => {
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
  });
});
