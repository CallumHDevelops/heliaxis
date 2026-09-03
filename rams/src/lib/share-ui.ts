import type { ShareLink } from '@/lib/types';

// Client-safe half of the share-link module. The token generation and lookup
// live in share.ts, which is server-only.

export const EXPIRY_PRESETS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 336, label: '14 days' },
  { hours: 720, label: '30 days' },
  { hours: 2160, label: '90 days' },
] as const;

export const MAX_EXPIRY_HOURS = 2160;

export function linkStatus(link: ShareLink): {
  label: string;
  tone: 'live' | 'expired' | 'revoked';
} {
  if (link.revoked_at) return { label: 'Revoked', tone: 'revoked' };
  if (new Date(link.expires_at).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'expired' };
  }
  if (link.max_views !== null && link.view_count >= link.max_views) {
    return { label: 'View limit reached', tone: 'expired' };
  }
  return { label: 'Live', tone: 'live' };
}
