import { describe, expect, it } from 'vitest';
import { adComment, adPostsFrom } from '@/lib/social/connectors/metaAds';

const ads = {
  data: [
    { id: '1', name: 'Solar spring', creative: { effective_object_story_id: '123_456', effective_instagram_media_id: '999' } },
    { id: '2', name: 'Solar spring (copy)', creative: { effective_object_story_id: '123_456' } },
    { id: '3', name: 'Battery', creative: { effective_object_story_id: '123_789' } },
    { id: '4', name: 'No post', creative: {} },
    { name: 'No id', creative: { effective_object_story_id: '1_1' } },
  ],
};

describe('comments on Meta ads', () => {
  it('finds the post behind each ad and reads a shared post once', () => {
    const posts = adPostsFrom(ads);
    expect(posts.map((p) => p.adId)).toEqual(['1', '3']);
    expect(posts[0]).toMatchObject({ facebookPostId: '123_456', instagramMediaId: '999', adName: 'Solar spring' });
  });
  it('copes with an error or empty answer', () => {
    expect(adPostsFrom(null)).toEqual([]);
    expect(adPostsFrom({ error: { message: 'x' } })).toEqual([]);
  });
  it('turns a Facebook ad comment into a mention that remembers the ad', () => {
    const post = adPostsFrom(ads)[0];
    const m = adComment('facebook', { id: '123_456_77', message: 'How much for a 4kW system?', created_time: '2026-10-26T10:00:00+0000', from: { id: 'u1', name: 'Sam' } }, post)!;
    expect(m).toMatchObject({ platform: 'facebook', platformId: '123_456_77', platformPostId: '123_456', kind: 'comment', text: 'How much for a 4kW system?', authorDisplayName: 'Sam' });
    expect(m.raw).toMatchObject({ ad: { id: '1', name: 'Solar spring' } });
  });
  it('turns an Instagram ad comment into a mention', () => {
    const post = adPostsFrom(ads)[0];
    const m = adComment('instagram', { id: 'c1', text: 'Interested!', timestamp: '2026-10-26T10:00:00+0000', username: 'sam_w' }, post)!;
    expect(m).toMatchObject({ platform: 'instagram', platformId: 'c1', platformPostId: '999', text: 'Interested!' });
  });
  it('has nothing for a platform the ad has no post on', () => {
    const post = adPostsFrom(ads)[1];
    expect(adComment('instagram', { id: 'c', text: 'x' }, post)).toBeNull();
  });
});
