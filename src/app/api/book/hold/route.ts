import { schemaReady } from '@/lib/schema-ready';
import { isSurveyType } from '@/lib/crm/stages';
import { hold } from '@/lib/booking/book';
import { clientIp, ipKey, publicGuard, publicJson, rateHit, readBody, turnstileOn, verifyTurnstile } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** Hold the picked time for 10 minutes (on Continue): { token?, postcode, type, start, releases?, turnstile? }. */
export async function POST(req: Request) {
  const refused = publicGuard(req);
  if (refused) return refused;
  if (!(await schemaReady()).booking) return publicJson({ closed: true });
  const b = await readBody(req);
  const token = typeof b.token === 'string' && b.token ? b.token : null;
  if (!token && turnstileOn() && !(await verifyTurnstile(b.turnstile, clientIp(req)))) {
    return publicJson({ error: 'Please tick the box to show you’re not a robot.', code: 'turnstile' }, 400);
  }
  const key = ipKey(req);
  if (!(await rateHit(`hold:${key}`, 3600, 12))) return publicJson({ error: 'Too many tries. Please wait a little and try again, or call us.' }, 429);
  if (!isSurveyType(b.type)) return publicJson({ error: 'Please choose what the survey is for.' }, 400);
  const start = Date.parse(String(b.start || ''));
  if (!Number.isFinite(start)) return publicJson({ error: 'Please pick a time.' }, 400);
  const o = await hold({
    postcode: String(b.postcode || ''),
    type: b.type,
    start,
    token,
    ipKey: key,
    releases: typeof b.releases === 'string' ? b.releases : null,
  });
  return publicJson(o.body, o.status);
}
