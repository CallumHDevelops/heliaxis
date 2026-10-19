import { crmSession, isUuid, json } from '@/lib/crm/server';
import { bookingLinkFor, staffFrom } from '@/lib/booking/book';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** The customer's booking link: { project_id } → { url, whatsappText }. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = await readBody(req);
  if (typeof b.project_id !== 'string' || !isUuid(b.project_id)) return json({ error: 'Pick a job first.' }, 400);
  const o = await bookingLinkFor(b.project_id, staffFrom(s));
  return json(o.body, o.status);
}
