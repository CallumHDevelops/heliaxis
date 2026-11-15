import { describe, expect, it } from 'vitest';
import { cleanReviewSettings, DEFAULT_REVIEW_SETTINGS, fillTemplate, googleReviewFromPlaceId, reviewLink } from '@/lib/reviews/shared';

describe('review requests', () => {
  it('keeps only https links and falls back to the default wording', () => {
    const s = cleanReviewSettings({ googleUrl: 'http://insecure.example', trustpilotUrl: 'https://www.trustpilot.com/evaluate/heliaxis.co.uk', emailSubject: '' });
    expect(s.googleUrl).toBe('');
    expect(s.trustpilotUrl).toBe('https://www.trustpilot.com/evaluate/heliaxis.co.uk');
    expect(s.emailSubject).toBe(DEFAULT_REVIEW_SETTINGS.emailSubject);
  });
  it('fills in the name and link', () => {
    expect(fillTemplate('Hi {first}, {link}', { first: 'Ada', link: 'https://x/y' })).toBe('Hi Ada, https://x/y');
    expect(fillTemplate('Hi {first}', { first: '', link: '' })).toBe('Hi there');
  });
  it('makes the personal link and the Google link', () => {
    expect(reviewLink('https://heliaxis.co.uk/', 'abc')).toBe('https://heliaxis.co.uk/review/abc');
    expect(googleReviewFromPlaceId('ChIJ abc')).toBe('https://search.google.com/local/writereview?placeid=ChIJ%20abc');
  });
  it('the default wording never screens by how happy the customer is, and offers nothing in return', () => {
    const all = [DEFAULT_REVIEW_SETTINGS.emailSubject, DEFAULT_REVIEW_SETTINGS.emailBody, DEFAULT_REVIEW_SETTINGS.smsText].join(' ');
    expect(all).not.toMatch(/if you(?:'|’)re happy|if you are happy|satisfied|gift|voucher|£\d|discount|reward/i);
  });
});
