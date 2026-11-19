import { describe, expect, it } from 'vitest';
import { classifyChannel, referrerHost } from '@/lib/search/channel';
import { attributionFromUrl, parseFirstTouch } from '@/lib/attribution';
import { band, bandCounts, delta, unknownNumbers, visibilityScore, weightedPosition, winnersAndLosers } from '@/lib/search/maths';
import { plannedJobs, ukClock, weekOf } from '@/lib/search/schedule';
import { can, parseSetting, searchRole, tierOf, DEFAULT_AREAS } from '@/lib/search/settings';

describe('channel classifier (M8 rules, in order)', () => {
  it('follows the spec order', () => {
    expect(classifyChannel({ fb: 1, r: 'google.co.uk' })).toBe('paid_meta');
    expect(classifyChannel({ s: 'facebook' })).toBe('paid_meta');
    expect(classifyChannel({ g: 1 })).toBe('paid_google');
    expect(classifyChannel({ s: 'google', m: 'cpc' })).toBe('paid_google');
    expect(classifyChannel({ s: 'google', m: 'organic', c: 'gbp' })).toBe('gbp');
    expect(classifyChannel({ s: 'chatgpt.com' })).toBe('ai_assistant');
    expect(classifyChannel({ r: 'perplexity.ai' })).toBe('ai_assistant');
    expect(classifyChannel({ r: 'gemini.google.com' })).toBe('ai_assistant');
    expect(classifyChannel({ r: 'google.co.uk' })).toBe('organic_google');
    expect(classifyChannel({ r: 'www.google.com' })).toBe('organic_google');
    expect(classifyChannel({ r: 'bing.com' })).toBe('organic_bing');
    expect(classifyChannel({ r: 'checkatrade.com' })).toBe('referral');
    expect(classifyChannel({})).toBe('direct');
    expect(classifyChannel(null)).toBe('direct');
  });

  it('reads referrer hosts, ignoring our own site', () => {
    expect(referrerHost('https://www.google.co.uk/')).toBe('google.co.uk');
    expect(referrerHost('https://heliaxis.co.uk/blog')).toBeNull();
    expect(referrerHost('https://preview.vercel.app/x', 'preview.vercel.app')).toBeNull();
    expect(referrerHost('not a url')).toBeNull();
  });

  it('phase 1 gate: a form arriving from google.co.uk is organic_google', () => {
    const a = attributionFromUrl(new URL('https://heliaxis.co.uk/solar-panels-cardiff'), 'https://www.google.co.uk/');
    expect(a).toMatchObject({ r: 'google.co.uk', p: '/solar-panels-cardiff', ch: 'organic_google' });
    // An untagged visit from nowhere records nothing.
    expect(attributionFromUrl(new URL('https://heliaxis.co.uk/'), '')).toBeNull();
    // Without consent: the session-storage first touch.
    expect(parseFirstTouch({ r: 'www.google.co.uk', p: '/', t: 1 })).toMatchObject({ r: 'google.co.uk', ch: 'organic_google' });
    expect(parseFirstTouch({ r: '', p: '/x' })).toMatchObject({ ch: 'direct' });
    expect(parseFirstTouch('junk')).toBeNull();
  });
});

describe('maths', () => {
  it('bands positions', () => {
    expect([1, 3, 4, 10, 11, 20, 21, 50, 51, 100, 101, null].map(band)).toEqual(['1-3', '1-3', '4-10', '4-10', '11-20', '11-20', '21-50', '21-50', '51-100', '51-100', 'not found', 'not found']);
    expect(bandCounts([1, 5, null])['not found']).toBe(1);
  });

  it('scores visibility against position 1 for every search', () => {
    expect(visibilityScore([{ pos: 1, volume: 100 }])).toBe(100);
    expect(visibilityScore([{ pos: null, volume: 100 }])).toBe(0);
    expect(visibilityScore([{ pos: 1, volume: 100 }, { pos: null, volume: 100 }])).toBe(50);
  });

  it('weights position by impressions', () => {
    expect(weightedPosition([{ impressions: 90, position: 10 }, { impressions: 10, position: 1 }])).toBe(9.1);
    expect(weightedPosition([])).toBeNull();
  });

  it('compares periods, hiding percentages on small numbers', () => {
    expect(delta(12, 10)).toMatchObject({ abs: 2, pct: 20, good: true, small: false });
    expect(delta(3, 2)).toMatchObject({ abs: 1, pct: null, small: true });
    expect(delta(8, 10, true)).toMatchObject({ good: true });
    expect(delta(null, 3).abs).toBeNull();
  });

  it('ranks winners and losers by places × volume', () => {
    const wl = winnersAndLosers([
      { keywordId: 1, label: 'a', before: 20, now: 10, volume: 10 },
      { keywordId: 2, label: 'b', before: 8, now: 5, volume: 1000 },
      { keywordId: 3, label: 'c', before: 5, now: 9, volume: 50 },
      { keywordId: 4, label: 'd', before: null, now: 60, volume: 10 },
    ]);
    expect(wl.winners.map((w) => w.keywordId)).toEqual([2, 4, 1]);
    expect(wl.losers.map((w) => [w.keywordId, w.moved])).toEqual([[3, -4]]);
  });

  it('finds numbers in report text that are not in the snapshot', () => {
    expect(unknownNumbers('Clicks rose to 1,240 from 980, up 26.5%.', [1240, 980, 26.5])).toEqual([]);
    expect(unknownNumbers('We now rank 3rd in 14 towns.', [3])).toEqual(['14']);
  });
});

describe('schedule (UK time)', () => {
  it('knows UK weekdays and weeks', () => {
    expect(ukClock(new Date('2026-11-22T23:30:00Z'))).toMatchObject({ date: '2026-11-22', dow: 0, hour: 23 });
    expect(weekOf('2026-11-19')).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(weekOf('2026-11-16').start).toBe('2026-11-16');
  });

  it('queues the weekly phone run on Sunday night only', () => {
    const sun = plannedJobs(new Date('2026-11-22T23:05:00Z')).map((j) => j.dedupeKey);
    expect(sun).toContain('serp_post:mobile:2026-11-22');
    expect(plannedJobs(new Date('2026-11-22T22:50:00Z')).some((j) => j.kind === 'serp_post')).toBe(false);
    const mon = plannedJobs(new Date('2026-11-23T07:10:00Z')).map((j) => j.kind);
    expect(mon).toEqual(expect.arrayContaining(['site_audit', 'ranked_keywords', 'weekly_report', 'gsc_import']));
    // British Summer Time: 23:00 UK is 22:00 UTC.
    expect(plannedJobs(new Date('2026-07-05T22:10:00Z')).some((j) => j.kind === 'serp_post')).toBe(true);
  });
});

describe('settings and roles', () => {
  it('falls back to defaults for missing or bad values', () => {
    expect(parseSetting('budget', null).caps.dataforseo).toBe(40);
    expect(parseSetting('business', { credentials: ['NICEIC'] }).credentials).toEqual(['MCS', 'RECC', 'NAPIT']);
    expect(parseSetting('content', {}).weeklyNewPages).toBe(3);
  });

  it('gives roles: every admin is owner until an owner is set', () => {
    const none = parseSetting('access', {});
    expect(searchRole({ id: 'a', role: 'admin' }, none)).toBe('owner');
    const set = parseSetting('access', { roles: { b: 'owner', c: 'editor' } });
    expect(searchRole({ id: 'a', role: 'admin' }, set)).toBe('admin');
    expect(searchRole({ id: 'c', role: 'member' }, set)).toBe('editor');
    expect(searchRole({ id: 'd', role: 'member' }, set)).toBe('viewer');
    expect(can.spend('editor')).toBe(false);
    expect(can.editSetting('admin', 'budget')).toBe(false);
    expect(can.editSetting('admin', 'alerts')).toBe(true);
  });

  it('puts towns in their tier', () => {
    expect(tierOf('Cardiff', DEFAULT_AREAS)).toBe(1);
    expect(tierOf('Caerphilly', DEFAULT_AREAS)).toBe(2);
    expect(tierOf('Gloucester', DEFAULT_AREAS)).toBe(3);
    expect(tierOf('Nowhere', DEFAULT_AREAS)).toBe(3);
  });
});
