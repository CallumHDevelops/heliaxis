import { createHash } from 'node:crypto';
import { schemaReady } from '@/lib/schema-ready';
import { bookingForToken, moveBooking } from '@/lib/booking/book';
import { ipKey, publicGuard, publicJson, rateHit, readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** The customer moves their own survey (their link, until 24 hours before): { token, start }. */
export async function POST(req: Request) {
  const refused = publicGuard(req);
  if (refused) return refused;
  if (!(await schemaReady()).booking) return publicJson({ closed: true });
  const b = await readBody(req);
  const token = typeof b.token === 'string' ? b.token : '';
  if (!token) return publicJson({ error: 'This link has expired. Message us on WhatsApp.' }, 404);
  const tag = createHash('sha256').update(token).digest('base64url').slice(0, 24);
  if (!(await rateHit(`move-ip:${ipKey(req)}`, 3600, 30))) return publicJson({ error: 'Too many tries. Please call us to change your survey.' }, 429);
  // The link first, so a made-up token is turned away before it gets a count of its own.
  const found = await bookingForToken(token);
  if ('status' in found) return publicJson(found.body, found.status);
  if (!(await rateHit(`move:${tag}`, 86_400, 10))) return publicJson({ error: 'Please call us to change your survey.' }, 429);
  const start = Date.parse(String(b.start || ''));
  if (!Number.isFinite(start)) return publicJson({ error: 'Please pick a time.' }, 400);
  const o = await moveBooking(found.b, start, { by: null });
  return publicJson(o.body, o.status);
}
