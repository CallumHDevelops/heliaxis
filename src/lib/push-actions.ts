import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Buttons on the Android app's native notifications ("Send now" / "Cancel reply" on a queued
 * smart reply). The app has no sign-in of its own (that lives in Chrome), so each button carries
 * a short-lived signed token naming exactly one action on one queued reply.
 */

export type PushAction = 'outbox-send' | 'outbox-cancel';
export const PUSH_ACTIONS: PushAction[] = ['outbox-send', 'outbox-cancel'];
const TTL_S = 6 * 3600;

function sign(payload: string) {
  const s = process.env.APP_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('No secret for push actions');
  return createHmac('sha256', s).update(`push-action:${payload}`).digest('base64url');
}

export function signPushAction(action: PushAction, outboxId: string): string | null {
  try {
    const payload = Buffer.from(JSON.stringify({ a: action, o: outboxId, e: Math.floor(Date.now() / 1000) + TTL_S })).toString(
      'base64url'
    );
    return `${payload}.${sign(payload)}`;
  } catch {
    return null;
  }
}

export function readPushAction(token: unknown): { action: PushAction; outboxId: string } | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(payload));
  } catch {
    return null;
  }
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { a, o, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!PUSH_ACTIONS.includes(a) || typeof o !== 'string' || typeof e !== 'number' || e < Date.now() / 1000) return null;
    return { action: a, outboxId: o };
  } catch {
    return null;
  }
}
