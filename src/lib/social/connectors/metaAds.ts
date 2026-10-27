import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestMention } from '../ingest';
import { platformGet } from '../readonlyGuard';
import type { NormalisedMention } from '../types';
import { normaliseGraphComment } from './meta';

/**
 * Comments on your Meta ads. Comments on a "dark" ad post (one that exists only inside Ads Manager) are not sent to the
 * Page webhook, so this looks up the post behind every active or paused ad and reads its comments, every 5 minutes. The same
 * comment id as the webhook gives, so a comment is never saved twice. Read only: needs `ads_read` and `pages_read_engagement`
 * (and `instagram_manage_comments` for Instagram ads) on META_SOCIAL_TOKEN, and META_AD_ACCOUNT_ID.
 */
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`;
const EVERY_MS = 4.5 * 60_000;
const MAX_ADS = 60;

export type AdPost = { adId: string; adName: string | null; facebookPostId: string | null; instagramMediaId: string | null };

/** The posts behind a list of ads (Graph API `/act_{id}/ads?fields=creative{...}`), skipping any ad with no post. */
export function adPostsFrom(data: unknown): AdPost[] {
  const rows = (data as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out: AdPost[] = [];
  // Several ads often share one post: read each post once.
  const seen = new Set<string>();
  const fresh = (platform: string, id: string | null) => {
    if (!id || seen.has(`${platform}:${id}`)) return null;
    seen.add(`${platform}:${id}`);
    return id;
  };
  for (const r of rows) {
    const a = r as { id?: unknown; name?: unknown; creative?: { effective_object_story_id?: unknown; effective_instagram_media_id?: unknown } };
    const adId = typeof a.id === 'string' ? a.id : null;
    if (!adId) continue;
    const fb = fresh('facebook', typeof a.creative?.effective_object_story_id === 'string' ? a.creative.effective_object_story_id : null);
    const ig = fresh('instagram', typeof a.creative?.effective_instagram_media_id === 'string' ? a.creative.effective_instagram_media_id : null);
    if (fb || ig) out.push({ adId, adName: typeof a.name === 'string' ? a.name : null, facebookPostId: fb, instagramMediaId: ig });
  }
  return out;
}

/** An ad's comment, tagged with the ad it was on so the review screen can say so. */
export function adComment(platform: 'facebook' | 'instagram', c: unknown, post: AdPost, now = new Date()): NormalisedMention | null {
  const postId = platform === 'facebook' ? post.facebookPostId : post.instagramMediaId;
  if (!postId) return null;
  const m = normaliseGraphComment(platform, c, postId, now);
  return m ? { ...m, raw: { comment: c, ad: { id: post.adId, name: post.adName } } } : null;
}

async function stamp(source: string, ok: boolean, error: string | null, red = false) {
  const db = createAdminClient();
  const t = new Date().toISOString();
  await db.from('social_connector_status').upsert(ok ? { source, status: 'green', last_success_at: t, last_error: null, updated_at: t } : { source, status: red ? 'red' : 'amber', last_error: (error ?? '').slice(0, 300), last_error_at: t, updated_at: t }, { onConflict: 'source' });
}

export async function pollAdComments(now = Date.now()): Promise<{ polled: boolean; ads?: number; comments?: number; error?: string }> {
  const token = process.env.META_SOCIAL_TOKEN;
  const raw = (process.env.META_AD_ACCOUNT_ID || '').trim().replace(/^act_/i, '');
  if (!token || !/^\d+$/.test(raw)) return { polled: false };
  const db = createAdminClient();
  const { data: st } = await db.from('social_connector_status').select('updated_at').eq('source', 'meta-ads').maybeSingle();
  if (st?.updated_at && now - Date.parse(st.updated_at) < EVERY_MS) return { polled: false };

  const status = encodeURIComponent('["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED"]');
  const ads = await platformGet<unknown>(`${GRAPH()}/act_${raw}/ads?fields=id,name,creative%7Beffective_object_story_id,effective_instagram_media_id%7D&effective_status=${status}&limit=100`, token);
  if (!ads.ok) {
    const permission = ads.status === 401 || ads.status === 403 || ads.code === 10 || ads.code === 200 || ads.code === 190;
    await stamp('meta-ads', false, ads.error, permission);
    return { polled: true, error: ads.error };
  }
  const posts = adPostsFrom(ads.data).slice(0, MAX_ADS);
  const started = Date.now();
  let comments = 0;
  let firstError: string | null = null;
  // A few at a time, and stop in good time: the every-minute job has about a minute.
  for (let i = 0; i < posts.length && Date.now() - started < 35_000; i += 4) {
    await Promise.all(
      posts.slice(i, i + 4).flatMap((post) => [
        post.facebookPostId
          ? platformGet<{ data?: unknown[] }>(`${GRAPH()}/${encodeURIComponent(post.facebookPostId)}/comments?fields=id,message,created_time,from%7Bid,name%7D,parent%7Bid%7D,permalink_url&filter=stream&order=reverse_chronological&limit=30`, token).then(async (r) => {
              if (!r.ok) return void (firstError ??= r.error);
              for (const c of r.data.data ?? []) {
                const m = adComment('facebook', c, post, new Date(now));
                if (m) {
                  await ingestMention(m).catch(() => undefined);
                  comments++;
                }
              }
            })
          : Promise.resolve(),
        post.instagramMediaId
          ? platformGet<{ data?: unknown[] }>(`${GRAPH()}/${encodeURIComponent(post.instagramMediaId)}/comments?fields=id,text,timestamp,username,parent_id&limit=30`, token).then(async (r) => {
              if (!r.ok) return void (firstError ??= r.error);
              for (const c of r.data.data ?? []) {
                const m = adComment('instagram', c, post, new Date(now));
                if (m) {
                  await ingestMention(m).catch(() => undefined);
                  comments++;
                }
              }
            })
          : Promise.resolve(),
      ]),
    );
  }
  // Some posts failing (an ad whose post we cannot read) is amber, not a stop: the rest were still read.
  await stamp('meta-ads', !firstError, firstError);
  return { polled: true, ads: posts.length, comments, ...(firstError ? { error: firstError } : {}) };
}
