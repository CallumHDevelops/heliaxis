import type { NormalisedMention } from '../types';

/**
 * Turns Meta's webhook payloads and Graph API comment objects into NormalisedMention. Pure: no I/O.
 * Facebook Page comments arrive on the `feed` field, Instagram comments on `comments`.
 */

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null);
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});

function iso(v: unknown, fallback: Date): string {
  if (typeof v === 'number') return new Date(v * 1000).toISOString();
  if (typeof v === 'string' && v) {
    const d = new Date(/^\d+$/.test(v) ? Number(v) * 1000 : v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback.toISOString();
}

export type OwnIds = { pageId?: string | null; igUserId?: string | null };
const ownIds = (): OwnIds => ({ pageId: process.env.META_PAGE_ID, igUserId: process.env.META_IG_USER_ID });

/** One `feed` change from a Page webhook. Returns null for anything that isn't a comment. */
export function normaliseFacebookFeedChange(value: unknown, now = new Date(), own: OwnIds = ownIds()): NormalisedMention | null {
  const v = obj(value);
  if (v.item !== 'comment') return null;
  const id = str(v.comment_id);
  if (!id) return null;
  const postId = str(v.post_id);
  const parent = str(v.parent_id);
  const from = obj(v.from);
  const fromId = str(from.id);
  const verb = str(v.verb);
  return {
    platform: 'facebook',
    platformId: id,
    platformPostId: postId,
    postPermalink: null,
    commentPermalink: null,
    // On Facebook a top-level comment's parent_id is the post, so only count it as a reply when it differs.
    parentPlatformId: parent && parent !== postId ? parent : null,
    kind: parent && parent !== postId ? 'reply' : 'comment',
    authorDisplayName: str(from.name),
    authorPlatformId: fromId,
    authorIsOwn: !!fromId && fromId === own.pageId,
    text: str(v.message) ?? '',
    rating: null,
    createdAt: iso(v.created_time, now),
    removed: verb === 'remove' || verb === 'hide',
    raw: value,
  };
}

/** One `comments` change from an Instagram webhook. */
export function normaliseInstagramChange(value: unknown, now = new Date(), own: OwnIds = ownIds()): NormalisedMention | null {
  const v = obj(value);
  const id = str(v.id);
  if (!id) return null;
  const from = obj(v.from);
  const fromId = str(from.id);
  const parent = str(v.parent_id);
  return {
    platform: 'instagram',
    platformId: id,
    platformPostId: str(obj(v.media).id),
    postPermalink: null,
    commentPermalink: null,
    parentPlatformId: parent,
    kind: parent ? 'reply' : 'comment',
    authorDisplayName: str(from.username),
    authorPlatformId: fromId ?? str(from.username),
    authorIsOwn: !!fromId && fromId === own.igUserId,
    text: str(v.text) ?? '',
    rating: null,
    createdAt: iso(v.timestamp, now),
    removed: false,
    raw: value,
  };
}

/** Every comment in a webhook body (`object` page or instagram). Order kept; anything unrecognised is skipped. */
export function normaliseMetaWebhook(body: unknown, now = new Date(), own: OwnIds = ownIds()): NormalisedMention[] {
  const b = obj(body);
  const out: NormalisedMention[] = [];
  const entries = Array.isArray(b.entry) ? b.entry : [];
  for (const e of entries) {
    const entry = obj(e);
    const at = typeof entry.time === 'number' ? new Date(entry.time * 1000) : now;
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const c of changes) {
      const change = obj(c);
      const m =
        b.object === 'page' && change.field === 'feed'
          ? normaliseFacebookFeedChange(change.value, at, own)
          : b.object === 'instagram' && change.field === 'comments'
            ? normaliseInstagramChange(change.value, at, own)
            : null;
      if (m) out.push(m);
    }
  }
  return out;
}

/** A comment as returned by the Graph API when polling (Facebook `/{post}/comments`, Instagram `/{media}/comments`). */
export function normaliseGraphComment(platform: 'facebook' | 'instagram', c: unknown, postId: string, now = new Date(), own: OwnIds = ownIds()): NormalisedMention | null {
  const v = obj(c);
  const id = str(v.id);
  if (!id) return null;
  const from = obj(v.from);
  const fromId = str(from.id);
  const parent = str(obj(v.parent).id);
  const fb = platform === 'facebook';
  return {
    platform,
    platformId: id,
    platformPostId: postId,
    postPermalink: null,
    commentPermalink: str(v.permalink_url),
    parentPlatformId: parent,
    kind: parent ? 'reply' : 'comment',
    authorDisplayName: fb ? str(from.name) : str(v.username) ?? str(from.username),
    authorPlatformId: fromId ?? str(v.username),
    authorIsOwn: !!fromId && (fb ? fromId === own.pageId : fromId === own.igUserId),
    text: str(fb ? v.message : v.text) ?? '',
    rating: null,
    createdAt: iso(fb ? v.created_time : v.timestamp, now),
    removed: false,
    raw: c,
  };
}
