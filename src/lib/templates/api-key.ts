import 'server-only';
import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * The shared secret SimpliHeat's server uses to call the forms API: `Authorization: Bearer <SIMPLIHEAT_API_KEY>`,
 * set on both apps, compared in constant time. Nothing here is reachable from a browser session. Returns an error
 * response, or null when the key is valid. Unset (under 32 characters), the API says it is not configured and
 * answers nothing.
 */
export function checkSimpliHeatKey(req: Request): NextResponse | null {
  const key = process.env.SIMPLIHEAT_API_KEY || '';
  if (key.length < 32) return NextResponse.json({ error: 'The SimpliHeat connection is not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const header = req.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Hash both so the lengths match and the comparison takes the same time whatever was sent.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(key).digest();
  if (!given || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return null;
}
