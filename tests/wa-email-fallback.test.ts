import { describe, expect, it } from 'vitest';
import { emailBodyFromWhatsApp, emailFooter, emailSubjectFor } from '@/lib/whatsapp/email-fallback';

describe('WhatsApp to email fallback', () => {
  it('drops quick-reply button lines but keeps the message', () => {
    const out = emailBodyFromWhatsApp('Hi David.\n\nRegards\nCallum\n\n[Call me today] [Call me tomorrow] [Message me instead]');
    expect(out).toBe('Hi David.\n\nRegards\nCallum');
  });
  it('keeps a sentence that merely contains brackets', () => {
    expect(emailBodyFromWhatsApp('Call us [any time] on weekdays')).toContain('[any time]');
  });
  it('adds a footer with the mailbox and a subject with the first name', () => {
    expect(emailFooter('hello@heliaxis.co.uk')).toContain('hello@heliaxis.co.uk');
    expect(emailSubjectFor('David Morgan')).toBe('David, a message from Heliaxis');
  });
});
