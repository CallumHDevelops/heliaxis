import { describe, expect, it } from 'vitest';
import { domainsFrom, geoShares, mentionedIn } from '@/lib/social/competitors/geo';

const biz = [
  { id: 'us', name: 'Heliaxis', website: 'https://heliaxis.co.uk' },
  { id: 'a', name: 'Green Energy Solar', website: 'https://greenenergysolar.example' },
  { id: 'b', name: 'GetZero', website: null },
];

describe('which businesses an AI answer names', () => {
  it('finds a business by name, ignoring case and punctuation', () => {
    expect(mentionedIn('Try Green-Energy Solar or GETZERO.', [], biz).sort()).toEqual(['a', 'b']);
  });
  it('finds a business by a website the answer cited', () => {
    expect(mentionedIn('Some installers are listed here.', ['www.heliaxis.co.uk'], biz)).toEqual(['us']);
  });
  it('does not match part of another word', () => {
    expect(mentionedIn('Our getzeroed budget is fine.', [], biz)).toEqual([]);
  });
  it('names nobody when nobody is named', () => {
    expect(mentionedIn('I cannot recommend a company.', [], biz)).toEqual([]);
  });
});

describe('share of answers', () => {
  it('is the fraction of answers naming the business', () => {
    const r = geoShares([{ prompt_id: 1, mentioned_ids: ['us', 'a'] }, { prompt_id: 1, mentioned_ids: ['a'] }, { prompt_id: 2, mentioned_ids: [] }, { prompt_id: 2, mentioned_ids: ['us'] }], ['us', 'a', 'b']);
    expect(r.answers).toBe(4);
    expect(r.shares).toEqual({ us: 50, a: 50, b: 0 });
  });
  it('has no shares from no answers', () => {
    expect(geoShares([], ['us']).shares.us).toBe(0);
  });
  it('turns urls into unique domains', () => {
    expect(domainsFrom(['https://www.a.com/x', 'https://a.com/y', 'bad', 'https://b.org'])).toEqual(['a.com', 'b.org']);
  });
});
