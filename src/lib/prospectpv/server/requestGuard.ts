/** Server-only helpers for the public routes: client IP (hashed) and rate limiting. */
import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabaseAdmin';

type HeaderBag = { get(name: string): string | null };

/** IP from Vercel's headers, hashed so raw IPs never land in the database. */
export function clientKey(h: HeaderBag): string {
  const ip = h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return createHash('sha256').update(`prospectpv:${ip}`).digest('hex').slice(0, 32);
}

/** True if allowed. Fails open on a database error so a blip never blocks a real customer. */
export async function rateLimit(bucket: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('pv_rate_limit_hit', {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error('[prospectpv] rate limit check failed', error.message);
    return true;
  }
  return data !== false;
}
