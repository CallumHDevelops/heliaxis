import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Guards for the public booking APIs (/api/book/*): JSON from our own pages only, rate limits keyed
 * by a hash of the visitor's IP (IPv6 cut to its /64, so one home can't dodge them by changing the
 * last part), and Cloudflare Turnstile on the website form once its keys are set.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };
export const publicJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** 403 unless it's a JSON POST from our own pages. Null = fine. */
export function publicGuard(req: Request): NextResponse | null {
  const type = (req.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return publicJson({ error: 'Please try again from our website.' }, 403);
  const site = req.headers.get('sec-fetch-site');
  if (site === 'same-origin') return null;
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host === host) return null;
    } catch {
      // A malformed Origin is refused below.
    }
  }
  return publicJson({ error: 'Please try again from our website.' }, 403);
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '0.0.0.0';
}

/** IPv6 → its first four groups (the /64); IPv4 (and IPv4-mapped IPv6) as it is. */
export function ipPrefix(ip: string): string {
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (!ip.includes(':') || (v4 && /^::ffff:/i.test(ip))) return v4 ? v4[1] : ip;
  const clean = ip.replace(/%.*$/, '').toLowerCase();
  const [head, tail] = clean.split('::');
  const a = head ? head.split(':') : [];
  const b = tail !== undefined && tail ? tail.split(':') : [];
  const full = tail !== undefined ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return full
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, '') || '0')
    .join(':');
}

let hmacKey: Buffer | null = null;
/** HMAC-SHA256 of the IP prefix. No new secret: the key is derived from the service-role key. */
export function ipKey(req: Request): string {
  hmacKey ??= createHash('sha256').update(`hx-booking-ip|${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest();
  return createHmac('sha256', hmacKey).update(ipPrefix(clientIp(req))).digest('base64url').slice(0, 32);
}

const local = new Map<string, number>();

/**
 * One hit on `key` in a fixed window. True = under the limit. Uses the rate_hit SQL function;
 * before survey-booking.sql has run, a per-instance count in memory.
 */
export async function rateHit(key: string, windowSecs: number, limit: number): Promise<boolean> {
  const r = await createAdminClient()
    .rpc('rate_hit', { p_key: key, p_window_secs: windowSecs, p_limit: limit })
    .then(
      (x) => x,
      () => ({ data: null, error: { message: 'missing' } })
    );
  if (!r.error && typeof r.data === 'boolean') return r.data;
  const bucket = `${key}|${Math.floor(Date.now() / 1000 / windowSecs)}`;
  const n = (local.get(bucket) ?? 0) + 1;
  if (local.size > 10_000) local.clear();
  local.set(bucket, n);
  return n <= limit;
}

export const turnstileOn = () => !!(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/** Cloudflare's "I'm not a robot" check. */
export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY || '', response: token, remoteip: ip }),
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    const d = (await r.json().catch(() => ({}))) as { success?: boolean };
    return d.success === true;
  } catch {
    return false;
  }
}

/** The request's JSON body as an object (empty if it isn't one). */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const b: unknown = await req.json().catch(() => null);
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}
