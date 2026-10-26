import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { platformGet } from '../readonlyGuard';

/**
 * Daily snapshots of the Facebook Page and the Instagram account: followers, the Page's views and reach, and
 * likes, comments and shares per recent post. Read only (every call is a GET through platformGet). History is
 * ours: a day's numbers are saved as they were that day. A metric Meta refuses is recorded as missing on the
 * connection's status, never filled with a stand-in.
 */

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}`;
const IG = 'https://graph.instagram.com';

export const ukDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);

type Row = { date: string; platform: string; account_id: string; scope: 'account' | 'post'; object_id: string; metric: string; value: number; source_api: string; api_metric_name: string | null };

async function save(rows: Row[]) {
  if (!rows.length) return;
  await createAdminClient().from('social_metric_snapshot').upsert(rows, { onConflict: 'date,platform,account_id,scope,object_id,metric' });
}

async function status(source: 'facebook' | 'instagram', ok: boolean, error?: string) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  await db.from('social_connector_status').upsert(
    ok ? { source, status: 'green', last_success_at: now, last_error: null, updated_at: now } : { source, status: 'amber', last_error: error?.slice(0, 300) ?? 'failed', last_error_at: now, updated_at: now },
    { onConflict: 'source' }
  );
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Facebook Page: followers, Page insights for yesterday, and the last posts' reactions, comments and shares. */
export async function collectFacebook(date = ukDate()): Promise<{ saved: number; missing: string[] }> {
  const token = process.env.META_SOCIAL_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  if (!token || !pageId) return { saved: 0, missing: ['connection not set up'] };
  const rows: Row[] = [];
  const missing: string[] = [];
  const base = { date, platform: 'facebook', account_id: pageId };

  const page = await platformGet<{ followers_count?: number; fan_count?: number }>(`${GRAPH}/${pageId}?fields=followers_count,fan_count`, token);
  if (page.ok) {
    const f = num(page.data.followers_count);
    if (f != null) rows.push({ ...base, scope: 'account', object_id: '', metric: 'followers', value: f, source_api: 'graph.facebook.com', api_metric_name: 'followers_count' });
  } else missing.push(`followers: ${page.error}`);

  for (const [metric, api] of [['views', 'page_media_view'], ['reach_unique', 'page_total_media_view_unique'], ['post_engagements', 'page_post_engagements']] as const) {
    const r = await platformGet<{ data?: { values?: { value: number }[] }[] }>(`${GRAPH}/${pageId}/insights?metric=${api}&period=day`, token);
    const v = r.ok ? num(r.data.data?.[0]?.values?.slice(-1)[0]?.value) : null;
    if (v != null) rows.push({ ...base, scope: 'account', object_id: '', metric, value: v, source_api: 'graph.facebook.com', api_metric_name: api });
    else missing.push(`${metric}: ${r.ok ? 'no value returned' : r.error}`);
  }

  const posts = await platformGet<{ data?: { id: string; created_time?: string; message?: string; permalink_url?: string; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }[] }>(
    `${GRAPH}/${pageId}/published_posts?fields=id,created_time,message,permalink_url,reactions.summary(true).limit(0),comments.summary(true).limit(0),shares&limit=25`,
    token
  );
  if (posts.ok) {
    const db = createAdminClient();
    for (const p of posts.data.data ?? []) {
      await db.from('social_post').upsert({ platform: 'facebook', platform_post_id: p.id, permalink: p.permalink_url ?? null, caption_excerpt: (p.message ?? '').slice(0, 200) || null, published_at: p.created_time ?? null }, { onConflict: 'platform,platform_post_id' });
      const add = (metric: string, v: number | null | undefined, api: string) => {
        if (v != null) rows.push({ ...base, scope: 'post', object_id: p.id, metric, value: v, source_api: 'graph.facebook.com', api_metric_name: api });
      };
      add('likes', p.reactions?.summary?.total_count, 'reactions.summary.total_count');
      add('comments', p.comments?.summary?.total_count, 'comments.summary.total_count');
      add('shares', p.shares?.count ?? 0, 'shares.count');
    }
  } else missing.push(`posts: ${posts.error}`);

  await save(rows);
  await status('facebook', rows.length > 0, missing.join('; '));
  return { saved: rows.length, missing };
}

/** Instagram: followers and the last posts' likes and comments. Views and reach need a permission the connection does not have. */
export async function collectInstagram(date = ukDate()): Promise<{ saved: number; missing: string[] }> {
  const token = process.env.META_IG_TOKEN;
  const id = process.env.META_IG_USER_ID;
  if (!token || !id) return { saved: 0, missing: ['connection not set up'] };
  const rows: Row[] = [];
  const missing: string[] = [];
  const base = { date, platform: 'instagram', account_id: id };

  const acct = await platformGet<{ followers_count?: number }>(`${IG}/${id}?fields=followers_count,media_count`, token);
  if (acct.ok) {
    const f = num(acct.data.followers_count);
    if (f != null) rows.push({ ...base, scope: 'account', object_id: '', metric: 'followers', value: f, source_api: 'graph.instagram.com', api_metric_name: 'followers_count' });
  } else missing.push(`followers: ${acct.error}`);

  const media = await platformGet<{ data?: { id: string; caption?: string; media_type?: string; timestamp?: string; permalink?: string; like_count?: number; comments_count?: number }[] }>(
    `${IG}/${id}/media?fields=id,caption,media_type,timestamp,permalink,like_count,comments_count&limit=25`,
    token
  );
  if (media.ok) {
    const db = createAdminClient();
    for (const m of media.data.data ?? []) {
      await db.from('social_post').upsert({ platform: 'instagram', platform_post_id: m.id, permalink: m.permalink ?? null, caption_excerpt: (m.caption ?? '').slice(0, 200) || null, content_type: m.media_type?.toLowerCase() ?? null, published_at: m.timestamp ?? null }, { onConflict: 'platform,platform_post_id' });
      const add = (metric: string, v: number | undefined, api: string) => {
        if (v != null) rows.push({ ...base, scope: 'post', object_id: m.id, metric, value: v, source_api: 'graph.instagram.com', api_metric_name: api });
      };
      add('likes', m.like_count, 'like_count');
      add('comments', m.comments_count, 'comments_count');
    }
  } else missing.push(`posts: ${media.error}`);

  await save(rows);
  await status('instagram', rows.length > 0, missing.join('; '));
  return { saved: rows.length, missing };
}

/** Runs once a day after 02:15 UK time: skips if today's account snapshot is already there. */
export async function runDailySnapshots(now = new Date()): Promise<{ ran: boolean; facebook?: number; instagram?: number }> {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  if (hm < '02:15') return { ran: false };
  const today = ukDate(now);
  const { data } = await createAdminClient().from('social_metric_snapshot').select('platform').eq('date', today).eq('scope', 'account').eq('metric', 'followers');
  const have = new Set((data ?? []).map((r) => r.platform as string));
  const out: { ran: boolean; facebook?: number; instagram?: number } = { ran: false };
  if (!have.has('facebook') && process.env.META_SOCIAL_TOKEN) {
    out.facebook = (await collectFacebook(today)).saved;
    out.ran = true;
  }
  if (!have.has('instagram') && process.env.META_IG_TOKEN) {
    out.instagram = (await collectInstagram(today)).saved;
    out.ran = true;
  }
  return out;
}
