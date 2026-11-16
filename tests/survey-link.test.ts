import { describe, expect, it } from 'vitest';
import { CHASE_CHOICES, COMPANY_PHONE, chaseWords, emailParagraphs, smsWords, whatsappWords } from '@/lib/booking/survey-link-text';
import { READY_MADE, blanksIn } from '@/lib/whatsapp/templates-shared';

const w = { first: 'Elizabeth', url: 'https://heliaxis.co.uk/book/abc', me: 'Callum' };

describe('survey link wording', () => {
  it('greets the customer by name and carries the link on every channel', () => {
    for (const t of [whatsappWords(w), smsWords(w), emailParagraphs(w).join(' ')]) {
      expect(t).toContain('Elizabeth');
      expect(t).toContain('survey');
    }
    expect(whatsappWords(w)).toContain(w.url);
    expect(smsWords(w)).toContain(w.url);
  });
  it('a text says how to reach us, because it cannot be replied to', () => {
    expect(smsWords(w)).toContain(COMPANY_PHONE);
    expect(smsWords(w)).not.toMatch(/reply here/i);
  });
  it('the approved WhatsApp template says what the free-text version says', () => {
    const t = READY_MADE.find((x) => x.name === 'survey_booking_link')!;
    expect(t).toBeTruthy();
    expect(blanksIn(t.body)).toEqual([1, 2, 3]);
    expect(t.fields).toHaveLength(3);
    const filled = t.body.replace('{{1}}', w.first).replace('{{2}}', w.url).replace('{{3}}', w.me);
    expect(filled).toBe(whatsappWords(w));
  });
  it('offers sensible reminder choices', () => {
    expect([...CHASE_CHOICES]).toEqual([0, 1, 2, 3, 7]);
    expect(chaseWords(0)).toBe('No reminder');
    expect(chaseWords(7)).toBe('In a week');
  });
});
