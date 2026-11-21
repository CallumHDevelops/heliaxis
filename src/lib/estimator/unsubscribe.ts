import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SITE_URL } from './copy';

/** The unsubscribe link in every estimator email: signed with a server secret, so only we can make one for a reference. */
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.META_APP_SECRET || 'heliaxis-dev-secret';
export const unsubscribeToken = (reference: string) => createHmac('sha256', secret()).update(`unsubscribe:${reference}`).digest('hex').slice(0, 24);
export const unsubscribeUrl = (reference: string) => `${SITE_URL()}/api/estimator/unsubscribe?r=${encodeURIComponent(reference)}&t=${unsubscribeToken(reference)}`;
export function validUnsubscribe(reference: string, token: string): boolean {
  const want = Buffer.from(unsubscribeToken(reference));
  const got = Buffer.from(String(token || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}
