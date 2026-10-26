import { describe, expect, it } from 'vitest';
import { normaliseTrustpilotReview } from '@/lib/social/connectors/trustpilot';
import { assertReadOnly, ReadOnlyViolation } from '@/lib/social/readonlyGuard';

const now = new Date('2026-10-26T09:00:00Z');

describe('Trustpilot reviews', () => {
  const r = { id: 'abc123', stars: 1, title: 'Awful', text: 'Never turned up', createdAt: '2026-10-25T10:00:00Z', consumer: { id: 'u1', displayName: 'Sam J' } };
  it('maps a review with its star rating, joined title and text, and a link', () => {
    expect(normaliseTrustpilotReview(r, now)).toMatchObject({
      platform: 'trustpilot',
      platformId: 'abc123',
      kind: 'review',
      rating: 1,
      text: 'Awful — Never turned up',
      authorDisplayName: 'Sam J',
      commentPermalink: 'https://www.trustpilot.com/reviews/abc123',
      createdAt: '2026-10-25T10:00:00.000Z',
      authorIsOwn: false,
    });
  });
  it('copes with a review with no title, text or name', () => {
    expect(normaliseTrustpilotReview({ id: 'x', stars: 5 }, now)).toMatchObject({ text: '', rating: 5, authorDisplayName: null });
  });
  it('ignores a review with no id and a rating outside 1 to 5', () => {
    expect(normaliseTrustpilotReview({ stars: 5 }, now)).toBeNull();
    expect(normaliseTrustpilotReview({ id: 'y', stars: 9 }, now)?.rating).toBeNull();
  });
  it('is only ever read: Trustpilot GET is allowed, anything else is refused', () => {
    expect(() => assertReadOnly('GET', 'https://api.trustpilot.com/v1/business-units/x/reviews')).not.toThrow();
    expect(() => assertReadOnly('POST', 'https://api.trustpilot.com/v1/reviews/x/reply')).toThrow(ReadOnlyViolation);
  });
});
