import { createHash } from 'node:crypto';
import { schemaReady } from '@/lib/schema-ready';
import { bookingForToken, cancelBooking } from '@/lib/booking/book';
import { ipKey, publicGuard, publicJson, rateHit, readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** The customer cancels their own survey (their link, until 24 hours before): { token, reason? }. */
export async function POST(req: Request) {
  const refused = publicGuard(req);
  if (refused) return refused;
  if (!(await schemaReady()).booking) return publicJson({ closed: true });
  const b = await readBody(req);
  const token = typeof b.token === 'string' ? b.token : '';
  if (!token) return publicJson({ error: 'This link has expired. Message us on WhatsApp.' }, 404);
  const tag = createHash('sha256').update(token).digest('base64url').slice(0, 24);
  if (!(await rateHit(`cancel-ip:${ipKey(req)}`, 3600, 30))) return publicJson({ error: 'Too many tries. Please call us to cancel your survey.' }, 429);
  // The link first, so a made-up token is turned away before it gets a count of its own.
  const found = await bookingForToken(token);
  if ('status' in found) return publicJson(found.body, found.status);
  if (!(await rateHit(`cancel:${tag}`, 86_400, 10))) return publicJson({ error: 'Please call us to cancel your survey.' }, 429);
  const o = await cancelBooking(found.b, { reason: typeof b.reason === 'string' ? b.reason : null });
  return publicJson(o.body, o.status);
}
