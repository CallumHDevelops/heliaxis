import { describe, expect, it } from 'vitest';
import { normaliseFacebookFeedChange, normaliseGraphComment, normaliseInstagramChange, normaliseMetaWebhook } from '@/lib/social/connectors/meta';

const own = { pageId: 'PAGE1', igUserId: 'IG1' };
const now = new Date('2026-10-25T10:00:00Z');

describe('Facebook feed changes', () => {
  const change = { item: 'comment', verb: 'add', comment_id: 'P_C1', post_id: 'P_POST', parent_id: 'P_POST', message: 'My GoodWe battery is smoking', from: { id: 'U1', name: 'Sam Jones' }, created_time: 1792922400 };
  it('maps a top-level comment', () => {
    const m = normaliseFacebookFeedChange(change, now, own)!;
    expect(m).toMatchObject({ platform: 'facebook', platformId: 'P_C1', kind: 'comment', parentPlatformId: null, text: 'My GoodWe battery is smoking', authorDisplayName: 'Sam Jones', authorPlatformId: 'U1', authorIsOwn: false, removed: false });
    expect(m.createdAt).toBe(new Date(1792922400 * 1000).toISOString());
  });
  it('treats a different parent_id as a reply', () => {
    const m = normaliseFacebookFeedChange({ ...change, parent_id: 'P_C0' }, now, own)!;
    expect(m.kind).toBe('reply');
    expect(m.parentPlatformId).toBe('P_C0');
  });
  it('flags our own Page comments', () => {
    expect(normaliseFacebookFeedChange({ ...change, from: { id: 'PAGE1', name: 'Heliaxis' } }, now, own)!.authorIsOwn).toBe(true);
  });
  it('marks remove and hide as removed', () => {
    expect(normaliseFacebookFeedChange({ ...change, verb: 'remove' }, now, own)!.removed).toBe(true);
    expect(normaliseFacebookFeedChange({ ...change, verb: 'hide' }, now, own)!.removed).toBe(true);
  });
  it('ignores posts, reactions and anything without a comment id', () => {
    expect(normaliseFacebookFeedChange({ item: 'status', verb: 'add' }, now, own)).toBeNull();
    expect(normaliseFacebookFeedChange({ item: 'comment' }, now, own)).toBeNull();
  });
  it('keeps an empty message as empty text', () => {
    expect(normaliseFacebookFeedChange({ ...change, message: undefined }, now, own)!.text).toBe('');
  });
});

describe('Instagram comments', () => {
  const v = { id: 'IGC1', text: 'Is it safe? 🔥', from: { id: 'IGU1', username: 'sam_j' }, media: { id: 'M1' } };
  it('maps a comment', () => {
    expect(normaliseInstagramChange(v, now, own)).toMatchObject({ platform: 'instagram', platformId: 'IGC1', platformPostId: 'M1', authorDisplayName: 'sam_j', authorIsOwn: false, kind: 'comment', createdAt: now.toISOString() });
  });
  it('maps a reply and our own account', () => {
    const m = normaliseInstagramChange({ ...v, parent_id: 'IGC0', from: { id: 'IG1', username: 'heliaxis' } }, now, own)!;
    expect(m.kind).toBe('reply');
    expect(m.authorIsOwn).toBe(true);
  });
});

describe('whole webhook bodies', () => {
  it('pulls comments out of a page body and skips leadgen', () => {
    const body = { object: 'page', entry: [{ id: 'PAGE1', time: 1792922400, changes: [
      { field: 'leadgen', value: { leadgen_id: '1' } },
      { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'C1', post_id: 'P', parent_id: 'P', message: 'hi', from: { id: 'U', name: 'A' } } },
    ] }] };
    const out = normaliseMetaWebhook(body, now, own);
    expect(out.map((m) => m.platformId)).toEqual(['C1']);
  });
  it('pulls comments out of an instagram body', () => {
    const body = { object: 'instagram', entry: [{ id: 'IG1', time: 1, changes: [{ field: 'comments', value: { id: 'X', text: 't', from: { id: 'u', username: 'n' }, media: { id: 'm' } } }] }] };
    expect(normaliseMetaWebhook(body, now, own)).toHaveLength(1);
  });
  it('copes with garbage', () => {
    expect(normaliseMetaWebhook(null, now, own)).toEqual([]);
    expect(normaliseMetaWebhook({ object: 'page', entry: 'x' }, now, own)).toEqual([]);
  });
});

describe('polled Graph comments', () => {
  it('maps a Facebook comment with a parent', () => {
    const m = normaliseGraphComment('facebook', { id: 'C', message: 'm', from: { id: 'U', name: 'N' }, created_time: '2026-10-25T09:00:00+0000', parent: { id: 'C0' }, permalink_url: 'https://fb/x' }, 'POST', now, own)!;
    expect(m).toMatchObject({ kind: 'reply', parentPlatformId: 'C0', commentPermalink: 'https://fb/x', text: 'm', authorDisplayName: 'N' });
  });
  it('maps an Instagram comment', () => {
    const m = normaliseGraphComment('instagram', { id: 'C', text: 't', username: 'u', timestamp: '2026-10-25T09:00:00+0000' }, 'M', now, own)!;
    expect(m).toMatchObject({ platform: 'instagram', text: 't', authorDisplayName: 'u', platformPostId: 'M' });
  });
});
