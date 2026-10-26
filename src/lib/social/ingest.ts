import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { alertForMention } from './alerts';
import { authorHash } from './hash';
import { combine } from './rules/combine';
import { keywordLayer } from './rules/keywordLayer';
import { sevRank, type Severity } from './rules/types';
import type { NormalisedMention } from './types';

const MAX_TEXT = 8000;

/** Saves the raw webhook body before anything else, so nothing is lost if later steps fail. */
export async function storeRaw(source: string, body: unknown, error?: string): Promise<number | null> {
  const { data } = await createAdminClient().from('social_ingest_event').insert({ source, body, ...(error ? { error, processed_at: new Date().toISOString() } : {}) }).select('id').single();
  return data?.id ?? null;
}

export async function markProcessed(id: number | null, error?: string) {
  if (id == null) return;
  await createAdminClient().from('social_ingest_event').update({ processed_at: new Date().toISOString(), error: error ?? null }).eq('id', id);
}

/**
 * Saves one comment and, if it is new or has been edited, scores it with the keyword layer straight away
 * and alerts for Critical and High. The AI classification is queued after this and can only raise it.
 * Our own comments are saved for the thread but never scored or alerted.
 */
export async function ingestMention(n: NormalisedMention): Promise<{ id: string | null; action: 'created' | 'edited' | 'unchanged' | 'removed' | 'own' | 'error' }> {
  const db = createAdminClient();
  const text = n.text.length > MAX_TEXT ? n.text.slice(0, MAX_TEXT) : n.text;
  const { data: existing } = await db
    .from('social_mention')
    .select('id, text, version, severity, removed_at_source')
    .eq('platform', n.platform)
    .eq('platform_id', n.platformId)
    .maybeSingle();

  if (existing) {
    if (n.removed) {
      if (!existing.removed_at_source) await db.from('social_mention').update({ removed_at_source: true, updated_at: new Date().toISOString() }).eq('id', existing.id);
      return { id: existing.id, action: 'removed' };
    }
    if (existing.text === text || !text) return { id: existing.id, action: 'unchanged' };
    const version = existing.version + 1;
    await db.from('social_mention_version').upsert({ mention_id: existing.id, version: existing.version, text: existing.text });
    await db.from('social_mention_version').upsert({ mention_id: existing.id, version, text, edited_at: new Date().toISOString() });
    await db.from('social_mention').update({ text, version, edited_at: new Date().toISOString(), raw: n.raw as object, updated_at: new Date().toISOString() }).eq('id', existing.id);
    await score(existing.id, n, text, version, existing.severity as Severity | null);
    return { id: existing.id, action: 'edited' };
  }

  // A comment we never saw that was removed straight away: nothing to show.
  if (n.removed) return { id: null, action: 'removed' };

  const postId = await postFor(n);
  const parent = n.parentPlatformId ? await mentionIdFor(n.platform, n.parentPlatformId) : null;
  const { data: row, error } = await db
    .from('social_mention')
    .insert({
      platform: n.platform,
      platform_id: n.platformId,
      kind: n.kind,
      post_id: postId,
      parent_id: parent?.id ?? null,
      thread_root_id: parent?.root ?? parent?.id ?? null,
      comment_permalink: n.commentPermalink,
      author_display_name: n.authorDisplayName,
      author_hash: authorHash(n.platform, n.authorPlatformId),
      author_is_own: n.authorIsOwn,
      text,
      text_truncated: n.text.length > MAX_TEXT,
      rating: n.rating,
      created_at: n.createdAt,
      status: n.authorIsOwn ? 'posted' : 'new',
      raw: n.raw as object,
    })
    .select('id')
    .single();
  if (error || !row) {
    // Two deliveries of the same comment at once: the second one loses the race and is a duplicate.
    return { id: null, action: error?.code === '23505' ? 'unchanged' : 'error' };
  }
  await db.from('social_mention_version').insert({ mention_id: row.id, version: 1, text });
  if (n.authorIsOwn) return { id: row.id, action: 'own' };
  await score(row.id, n, text, 1, null);
  return { id: row.id, action: 'created' };
}

async function postFor(n: NormalisedMention): Promise<string | null> {
  if (!n.platformPostId) return null;
  const db = createAdminClient();
  const { data } = await db
    .from('social_post')
    .upsert({ platform: n.platform, platform_post_id: n.platformPostId, permalink: n.postPermalink }, { onConflict: 'platform,platform_post_id', ignoreDuplicates: false })
    .select('id')
    .single();
  return data?.id ?? null;
}

async function mentionIdFor(platform: string, platformId: string): Promise<{ id: string; root: string | null } | null> {
  const { data } = await createAdminClient().from('social_mention').select('id, thread_root_id').eq('platform', platform).eq('platform_id', platformId).maybeSingle();
  return data ? { id: data.id, root: data.thread_root_id } : null;
}

/** Keyword layer + history rules now; saves the classification, sets severity, alerts, queues the AI step. */
async function score(id: string, n: NormalisedMention, text: string, version: number, floor: Severity | null) {
  const db = createAdminClient();
  const kw = keywordLayer.match(text);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const hash = authorHash(n.platform, n.authorPlatformId);
  let negative = 0;
  let openCritical = false;
  if (hash) {
    const { data: others } = await db.from('social_mention').select('id, severity, status').eq('platform', n.platform).eq('author_hash', hash).neq('id', id).gte('created_at', since).limit(50);
    negative = (others ?? []).filter((o) => o.severity === 'high' || o.severity === 'critical').length;
    openCritical = (others ?? []).some((o) => o.severity === 'critical' && o.status !== 'posted' && o.status !== 'dismissed');
  }
  const res = combine({
    keywordSeverity: kw.severity === 'high' || kw.severity === 'critical' ? kw.severity : null,
    keywordSafetyRelated: kw.safetyRelated,
    model: null,
    modelFailed: false,
    rating: n.rating,
    author: { negativeMentions30d: negative, hasOpenCritical: openCritical },
    thread: { parentOrRootOpenSeverity: null },
    escalatingThread: false,
    floor,
  });
  // Without the AI yet, an unmatched comment is Medium (needs a human look) until it is classified.
  const severity: Severity = sevRank(res.severity) >= sevRank('medium') ? res.severity : 'medium';
  await db.from('social_classification').insert({
    mention_id: id,
    mention_version: version,
    severity,
    keyword_severity: res.keywordSeverity,
    adjustments: res.adjustments,
    topics: kw.topics,
    safety_related: res.safetyRelated,
    rule_hits: kw.hits,
    model_status: 'pending',
    rules_version: kw.rulesVersion,
  });
  await db.from('social_mention').update({ severity, updated_at: new Date().toISOString() }).eq('id', id);
  await db.from('social_job').upsert({ kind: 'classify', dedupe_key: `classify:${id}:v${version}`, payload: { mentionId: id, version } }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  await alertForMention({ id, platform: n.platform, kind: n.kind, text, version, severity });
}
