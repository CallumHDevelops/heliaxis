import type { Platform } from './rules/types';

/** One comment, review or mention from any platform, in the one shape the rest of the code uses. */
export type NormalisedMention = {
  platform: Platform;
  /** The platform's own id for the comment. With `platform`, this is what stops duplicates. */
  platformId: string;
  platformPostId: string | null;
  postPermalink: string | null;
  commentPermalink: string | null;
  parentPlatformId: string | null;
  kind: 'comment' | 'reply' | 'mention' | 'review' | 'tag';
  authorDisplayName: string | null;
  /** The platform's id for the person (or their username on Instagram). Stored only as a hash. */
  authorPlatformId: string | null;
  /** Written by Heliaxis's own account: kept for the thread, never classified or alerted. */
  authorIsOwn: boolean;
  text: string;
  rating: number | null;
  /** ISO time from the platform. */
  createdAt: string;
  removed: boolean;
  raw: unknown;
};
