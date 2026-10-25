import crypto from 'node:crypto';

/** A scrambled id for spotting the same commenter again, without storing who they are. Null until SOCIAL_AUTHOR_PEPPER is set. */
export function authorHash(platform: string, authorId: string | null | undefined): string | null {
  const pepper = process.env.SOCIAL_AUTHOR_PEPPER;
  if (!pepper || !authorId) return null;
  return crypto.createHash('sha256').update(`${pepper}|${platform}|${authorId}`).digest('hex');
}
