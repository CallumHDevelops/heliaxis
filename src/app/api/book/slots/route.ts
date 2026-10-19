import { schemaReady } from '@/lib/schema-ready';
import { isSurveyType } from '@/lib/crm/stages';
import { projectByBookingToken } from '@/lib/crm/booking-link';
import { findFailOutcome, findSlots, liveBookingFor, publicDays } from '@/lib/booking/book';
import { ipKey, publicGuard, publicJson, rateHit, readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/** The times a customer can pick: { token?, postcode, type }. No names, no other customers, no Outlook subjects. */
export async function POST(req: Request) {
  const refused = publicGuard(req);
  if (refused) return refused;
  if (!(await schemaReady()).booking) return publicJson({ closed: true });
  if (!(await rateHit(`slots:${ipKey(req)}`, 600, 20))) return publicJson({ error: 'Too many searches. Please wait a few minutes and try again.' }, 429);
  const b = await readBody(req);
  if (!isSurveyType(b.type)) return publicJson({ error: 'Please choose what the survey is for.' }, 400);
  let ignore: string | null = null;
  if (typeof b.token === 'string' && b.token) {
    const p = await projectByBookingToken(b.token);
    if (!p) return publicJson({ error: 'This link has expired. Message us on WhatsApp.' }, 404);
    // Changing their time: their own booking doesn't count as busy.
    ignore = (await liveBookingFor(p.id))?.id ?? null;
  }
  const r = await findSlots({ postcode: String(b.postcode || ''), type: b.type, ignoreBookingId: ignore, signal: AbortSignal.timeout(8000) });
  if (!r.ok) {
    const o = findFailOutcome(r);
    return publicJson(o.body, o.status);
  }
  const days = publicDays(r.days);
  return publicJson({
    mode: r.mode,
    minutes: r.minutes,
    minutesText: r.minutesText,
    days,
    tooFar: r.tooFar,
    soonest: days[0] ? ([...days[0].morning, ...days[0].afternoon][0] ?? null) : null,
  });
}
