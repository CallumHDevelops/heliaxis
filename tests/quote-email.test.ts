import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { quoteEmailHtml } from '@/lib/quotes/email';
import { defaultQuoteMessage } from '@/lib/quotes/message';

describe('quote email', () => {
  it('is branded, has the message and a View your quote button to the portal', () => {
    const html = quoteEmailHtml(defaultQuoteMessage('Robert Evans', 'Your Heliaxis quote'), 'https://heliaxis.co.uk/my/abc');
    expect(html).toContain('HELIAXIS');
    expect(html).toContain('Dear Robert,');
    expect(html).toContain('href="https://heliaxis.co.uk/my/abc"');
    expect(html).toContain('View your quote');
    if (process.env.EMAIL_OUT) writeFileSync(process.env.EMAIL_OUT, html);
  });
  it('escapes anything typed into the message', () => {
    expect(quoteEmailHtml('<script>x</script>', 'https://x')).not.toContain('<script>x');
  });
});
