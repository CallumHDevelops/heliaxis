import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { newToken, portalBaseUrl, sha256 } from '@/lib/subcontractors/server';

/**
 * The site app's two secrets.
 *
 * - The **link** in a trade's message (/portal/site/j/<token>): one per assignment, made from the
 *   assignment and its link generation with a server key (HMAC), so the office can copy it again
 *   at any time without the token being stored anywhere; only its sha256 is (link_hash). "New
 *   link" moves the generation on, and the old link stops working.
 * - The **device** token a phone gets for the link (POST /api/site/open): random, kept in the
 *   phone's IndexedDB and sent as `Authorization: Bearer`; only its sha256 is stored (site_devices).
 *   A bearer header, not a cookie, because an iPhone Home Screen app doesn't share Safari's cookies.
 */

export const SITE_PATH = '/portal/site';
/** A device not used for this long has to open its link again. */
export const DEVICE_DAYS = 90;

/** The server key for links: SITE_LINK_SECRET, else one derived from the Supabase service key. */
function linkKey(): string {
  const own = process.env.SITE_LINK_SECRET;
  if (own && own.length >= 32) return own;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) throw new Error('No key for site links: set SITE_LINK_SECRET (32+ characters) or SUPABASE_SERVICE_ROLE_KEY.');
  return createHmac('sha256', base).update('heliaxis-site-links').digest('hex');
}

/** The link token for this assignment and generation (base64url, 43 characters). */
export function linkTokenFor(assignmentId: string, generation: number): string {
  return createHmac('sha256', linkKey()).update(`${assignmentId}:${generation}`).digest('base64url');
}

export const linkHashFor = (assignmentId: string, generation: number) => sha256(linkTokenFor(assignmentId, generation));

/** Does this token belong to this assignment's current link? (False when the key changed since it was made.) */
export function linkMatches(token: string, assignmentId: string, generation: number): boolean {
  const want = Buffer.from(linkTokenFor(assignmentId, generation));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The link as it goes in a message: the portal's domain (subcontractor.heliaxis.co.uk in production; this site elsewhere). */
export const siteLink = (token: string, origin?: string | null) => `${portalBaseUrl(origin || process.env.NEXT_PUBLIC_SITE_URL)}${SITE_PATH}/j/${token}`;

/** A token from the address, shaped like ours (anything else is refused before the database is asked). */
export const looksLikeToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{30,100}$/.test(t);

/** A fresh device token and the hash that's stored. */
export const newDeviceToken = () => newToken();

/** The bearer token on a request from the site app, if it has one. */
export function bearerOf(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]{30,100})$/.exec(h.trim());
  return m ? m[1] : null;
}
