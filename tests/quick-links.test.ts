import { describe, expect, it } from 'vitest';
import { appendBlock, QUICK_LINKS, quickLinkText } from '@/lib/quick-links';

describe('quick links', () => {
  it('builds a tagged booking link with the postcode', () => {
    const t = quickLinkText(QUICK_LINKS[0], { via: 'whatsapp', postcode: 'SA8 4BG' });
    expect(t).toContain('/book-a-survey?');
    expect(t).toContain('utm_source=whatsapp');
    expect(t).toContain('postcode=SA8+4BG');
  });
  it('video link keeps its mode, estimator gets no postcode', () => {
    expect(quickLinkText(QUICK_LINKS.find((l) => l.id === 'video')!, { via: 'email' })).toContain('mode=video');
    expect(quickLinkText(QUICK_LINKS.find((l) => l.id === 'estimator')!, { via: 'email', postcode: 'CF1 1AA' })).not.toContain('postcode');
  });
  it('appends on its own lines', () => {
    expect(appendBlock('Hi', 'Link')).toBe('Hi\n\nLink');
    expect(appendBlock('  ', 'Link')).toBe('Link');
  });
});
