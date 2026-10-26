import { describe, expect, it } from 'vitest';
import { defaultQuoteMessage, quoteWhatsApp } from '@/lib/quotes/message';

describe('quote message', () => {
  it('opens with Dear, names the quote only when it has its own title, and signs off', () => {
    const m = defaultQuoteMessage('Robert Evans', 'Your Heliaxis quote');
    expect(m.startsWith('Dear Robert,')).toBe(true);
    expect(m).toContain('We are pleased to send you your quote.');
    expect(defaultQuoteMessage('Robert Evans', 'Solar and battery')).toContain('your quote for Solar and battery.');
    expect(m).toMatch(/Kind regards,\nThe Heliaxis team$/);
  });
  it('puts the portal link in the WhatsApp wording', () => {
    expect(quoteWhatsApp('Dear Rob,', 'https://x/my/abc')).toBe('Dear Rob,\n\nClick here to access your portal and view your quote: https://x/my/abc');
  });
});
