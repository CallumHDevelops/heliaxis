import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { cleanSignatory } from '@/lib/quotes/signatory';
import { cleanContent, starterContent } from '@/lib/quotes/types';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('quote signatory', () => {
  it('needs a name and a PNG signature, and tidies the text', () => {
    expect(cleanSignatory({ name: '  Callum   Hiscott ', role: ' Director ', png: PNG })).toEqual({ name: 'Callum Hiscott', role: 'Director', png: PNG });
    expect(cleanSignatory({ name: '', png: PNG })).toBeNull();
    expect(cleanSignatory({ name: 'Callum', png: 'https://evil.example/x.png' })).toBeNull();
    expect(cleanSignatory({ name: 'Callum', png: 'data:image/png;base64,<script>' })).toBeNull();
  });
  it('keeps the quote’s sign-off switch only when it is turned off', () => {
    expect(cleanContent({ ...starterContent('Sam'), signOff: false }).signOff).toBe(false);
    expect(cleanContent({ ...starterContent('Sam'), signOff: true }).signOff).toBeUndefined();
  });
});
