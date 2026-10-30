import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { cleanSignatory } from '@/lib/quotes/signatory';
import { cleanContent, starterContent } from '@/lib/quotes/types';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('quote signatory', () => {
  it('needs a name and a PNG signature, and tidies the text', () => {
    expect(cleanSignatory({ name: '  Callum   Hiscott ', role: ' Director ', png: PNG })).toEqual({ name: 'Callum Hiscott', role: 'Director', png: PNG, shared: false });
    expect(cleanSignatory({ name: '', png: PNG })).toBeNull();
    expect(cleanSignatory({ name: 'Callum', png: 'https://evil.example/x.png' })).toBeNull();
    expect(cleanSignatory({ name: 'Callum', png: 'data:image/png;base64,<script>' })).toBeNull();
  });
  it('keeps the shared tick only when it is exactly true', () => {
    expect(cleanSignatory({ name: 'Callum', png: PNG, shared: true })?.shared).toBe(true);
    expect(cleanSignatory({ name: 'Callum', png: PNG, shared: 'yes' })?.shared).toBe(false);
  });
  it('keeps the quote’s sign-off switch only when it is turned off', () => {
    expect(cleanContent({ ...starterContent('Sam'), signOff: false }).signOff).toBe(false);
    expect(cleanContent({ ...starterContent('Sam'), signOff: true }).signOff).toBeUndefined();
    expect(cleanContent({ ...starterContent('Sam'), signerId: '11111111-1111-4111-8111-111111111111' }).signerId).toBe('11111111-1111-4111-8111-111111111111');
    expect(cleanContent({ ...starterContent('Sam'), signerId: 'not-an-id' }).signerId).toBeUndefined();
  });
});
