import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import QRCode from 'qrcode';
import { siteBaseUrl } from '@/lib/subcontractors/server';

/**
 * Personal "get the app" links: /get-app?t=<token>, opened on a phone without
 * signing in. The token is signed (HMAC) and carries the person's first name and
 * an expiry — no database row needed.
 */

const TTL_DAYS = 7;

function secret() {
  const s = process.env.APP_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('No secret for app links');
  return s;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(`app-link:${payload}`).digest('base64url');

export function createAppLinkToken(userId: string, firstName: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
  const payload = Buffer.from(JSON.stringify({ u: userId, n: firstName.slice(0, 40), e: exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readAppLinkToken(token: string | undefined | null): { userId: string; firstName: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(payload));
  } catch {
    return null; // no secret configured — treat as invalid rather than crash the page
  }
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.e !== 'number' || data.e < Date.now() / 1000) return null;
    return { userId: String(data.u), firstName: String(data.n || '') };
  } catch {
    return null;
  }
}

export function appLinkUrl(token: string, origin?: string | null) {
  return `${siteBaseUrl(origin)}/get-app?t=${encodeURIComponent(token)}`;
}

/** Inline SVG QR code for a link (scan with the phone camera). */
export function qrSvg(text: string) {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#211f18', light: '#fffdf8' } });
}

export const APP_LINK_TTL_DAYS = TTL_DAYS;
