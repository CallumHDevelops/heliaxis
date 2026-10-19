import { cookies } from 'next/headers';
import { schemaReady } from '@/lib/schema-ready';
import { ATTR_COOKIE, parseAttribution, sourceLabel } from '@/lib/attribution';
import { confirm, readDetails } from '@/lib/booking/book';
import { ipKey, publicGuard, publicJson, rateHit, readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Book the held time with the customer's details: { holdId, token?, name, email, phone, address,
 * town?, postcode, whatsappOptIn, notes?, company_website (must be empty), elapsedMs }.
 */
export async function POST(req: Request) {
  const refused = publicGuard(req);
  if (refused) return refused;
  if (!(await schemaReady()).booking) return publicJson({ closed: true });
  const b = await readBody(req);
  // Bots: the hidden field filled in, or the form sent within 3 seconds of loading.
  if ((typeof b.company_website === 'string' && b.company_website.trim()) || !(Number(b.elapsedMs) >= 3000)) {
    return publicJson({ error: 'Please try again.' }, 400);
  }
  if (!(await rateHit(`confirm:${ipKey(req)}`, 3600, 10))) return publicJson({ error: 'Too many tries. Please call us to book.' }, 429);
  const token = typeof b.token === 'string' && b.token ? b.token : null;
  // Website customers are labelled with where they came from (an ad, a tagged link).
  const source = token ? null : sourceLabel(parseAttribution((await cookies()).get(ATTR_COOKIE)?.value));
  const o = await confirm({ holdId: String(b.holdId || ''), token, details: readDetails(b), source });
  return publicJson(o.body, o.status);
}
