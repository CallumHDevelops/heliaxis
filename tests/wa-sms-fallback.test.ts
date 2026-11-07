import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { isUndeliverable, textOf } from '@/lib/whatsapp/sms-fallback';

describe('WhatsApp undeliverable → text', () => {
  it('knows the "not on WhatsApp" failure from other failures', () => {
    expect(isUndeliverable({ code: 131026, title: 'Message Undeliverable.' })).toBe(true);
    expect(isUndeliverable({ title: 'Message Undeliverable.' })).toBe(true);
    expect(isUndeliverable({ code: 131047, title: 'Re-engagement message' })).toBe(false);
    expect(isUndeliverable(undefined)).toBe(false);
  });

  it('turns a template with buttons into a text that says how to reply', () => {
    const t = textOf("Hi Suzanne.\n\nWhen would be a good time to ring?\n\nRegards\nCallum\n\n[Call me today] [Call me tomorrow] [Message me instead]");
    expect(t).not.toMatch(/\[Call me today\]/);
    expect(t).toMatch(/Regards\nCallum/);
    expect(t).toMatch(/call us on 01633 965205/);
  });

  it('leaves a plain message as it is', () => {
    expect(textOf('Hi, your survey is booked for 9am.')).toBe('Hi, your survey is booked for 9am.');
  });
});
