import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_EXPIRY_HOURS } from '@/lib/share-ui';
import type { ShareLink } from '@/lib/types';

/**
 * Share links are opaque 32-byte tokens. Only the SHA-256 hash is stored, so a
 * database leak yields no working links, and lookups are a single indexed
 * query on the hash.
 */

export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Salted with the service-role key so view records can't be reversed to an
  // IP by anyone who only has read access to the table.
  return createHash('sha256')
    .update(`${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

export function expiryFromHours(hours: number): Date {
  const clamped = Math.min(MAX_EXPIRY_HOURS, Math.max(1, Math.round(hours)));
  return new Date(Date.now() + clamped * 3_600_000);
}

export type ShareState =
  | { ok: true; link: ShareLink }
  | { ok: false; reason: 'not_found' | 'expired' | 'revoked' | 'view_limit' };

/**
 * Resolve a raw token to its link and record the view. Uses the service-role
 * client because the visitor is anonymous — every check below is the access
 * control, so they all have to run before any document data is returned.
 */
export async function resolveShareToken(
  token: string,
  meta: { ip: string | null; userAgent: string | null }
): Promise<ShareState> {
  if (!token || token.length < 16) return { ok: false, reason: 'not_found' };
  // Without a service-role key there is no way to validate a token, so fail
  // closed rather than throwing a 500 at the visitor.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: 'not_found' };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('share_links')
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  const link = data as ShareLink | null;
  if (!link) return { ok: false, reason: 'not_found' };
  if (link.revoked_at) return { ok: false, reason: 'revoked' };
  if (new Date(link.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  // Increment atomically, then check the cap against the returned count, so two
  // simultaneous viewers can't both pass a limit of one.
  const { data: newCount } = await admin.rpc('register_share_view', { link_id: link.id });
  if (link.max_views !== null && typeof newCount === 'number' && newCount > link.max_views) {
    return { ok: false, reason: 'view_limit' };
  }

  await admin.from('share_link_views').insert({
    share_link_id: link.id,
    ip_hash: hashIp(meta.ip),
    user_agent: meta.userAgent?.slice(0, 400) ?? null,
  });

  return { ok: true, link };
}

export function shareUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://rams.heliaxis.co.uk').replace(
    /\/$/,
    ''
  );
  return `${base}/share/${token}`;
}

