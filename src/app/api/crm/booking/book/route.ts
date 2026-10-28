import { crmSession, isUuid, json } from '@/lib/crm/server';
import { isSurveyType } from '@/lib/crm/stages';
import { schemaReady } from '@/lib/schema-ready';
import { staffBook, staffFrom } from '@/lib/booking/book';
import { readBody } from '@/lib/booking/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Book it (staff, confirmed straight away): { project_id, start, type, postcode?, surveyor_key?,
 * override?, all_day_ok?, notify? { email, whatsapp, sms } (tells the customer, each message with a check-the-pin link) }. postcode = the one Find a time searched with (saved to the job when it
 * differs). "Book anyway" (override) takes any start that doesn't overlap the diary; on a day
 * blocked all day it answers 409 { error: 'all_day', message } and needs all_day_ok to go ahead.
 */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await schemaReady()).booking) return json({ error: 'Run survey-booking.sql in Supabase first.' }, 409);
  const b = await readBody(req);
  if (typeof b.project_id !== 'string' || !isUuid(b.project_id)) return json({ error: 'Pick a job first.' }, 400);
  const start = Date.parse(String(b.start || ''));
  if (!Number.isFinite(start)) return json({ error: 'Pick a time.' }, 400);
  const o = await staffBook({
    projectId: b.project_id,
    start,
    type: isSurveyType(b.type) ? b.type : null,
    postcode: typeof b.postcode === 'string' ? b.postcode.slice(0, 12) : null,
    surveyorKey: typeof b.surveyor_key === 'string' ? b.surveyor_key.toLowerCase() : null,
    override: b.override === true,
    allDayOk: b.all_day_ok === true,
    notify: b.notify && typeof b.notify === 'object' ? { email: (b.notify as Record<string, unknown>).email === true, whatsapp: (b.notify as Record<string, unknown>).whatsapp === true, sms: (b.notify as Record<string, unknown>).sms === true } : undefined,
    by: staffFrom(s),
  });
  return json(o.body, o.status);
}
