import { cookies } from 'next/headers';
import { schemaReady } from '@/lib/schema-ready';
import { isSurveyType } from '@/lib/crm/stages';
import { ATTR_COOKIE, parseAttribution, sourceLabel } from '@/lib/attribution';
import { requestCallback } from '@/lib/booking/book';
import { ipKey, publicGuard, publicJson, rateHit, readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** "You're a little further than we can book online": { name, phone, email?, postcode, type }. We call them. */
export async function POST(req: Request) {
  const refused = publicGuard(req);
  if (refused) return refused;
  if (!(await schemaReady()).booking) return publicJson({ error: 'Please call us on 01633 965205.' }, 503);
  if (!(await rateHit(`callback:${ipKey(req)}`, 3600, 3))) return publicJson({ error: 'We’ve got your request. We’ll be in touch soon.' }, 429);
  const b = await readBody(req);
  if (typeof b.company_website === 'string' && b.company_website.trim()) return publicJson({ error: 'Please try again.' }, 400);
  const str = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');
  const o = await requestCallback({
    name: str('name', 120),
    phone: str('phone', 40),
    email: str('email', 200) || undefined,
    postcode: str('postcode', 12),
    type: isSurveyType(b.type) ? b.type : 'solar',
    source: sourceLabel(parseAttribution((await cookies()).get(ATTR_COOKIE)?.value)),
  });
  return publicJson(o.body, o.status);
}
