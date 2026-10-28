import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { staffFrom } from '@/lib/booking/book';
import { appointmentOf, channelsAvailable, recipientsOf, sendAppointmentByHand } from '@/lib/booking/appointment-manual';
import { toMsisdn } from '@/lib/sms';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** What can be sent from this job: its appointment, who could get it, and which ways are set up. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const [appointment, recipients] = await Promise.all([appointmentOf(id), recipientsOf(id)]);
  return json({
    appointment: appointment ? { whenText: appointment.whenText, who: appointment.who } : null,
    recipients: recipients.map((r) => ({ key: r.key, name: r.name, role: r.role, kind: r.kind, hasEmail: !!r.email && /^\S+@\S+\.\S+$/.test(r.email), hasMobile: !!toMsisdn(r.mobile) })),
    channels: channelsAvailable(),
  });
}

/** Send it: { recipients: ['customer', 'contact:<id>'], channels: { email, whatsapp, sms } }. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { recipients?: unknown; channels?: Record<string, unknown> };
  const keys = Array.isArray(b.recipients) ? b.recipients.map(String).filter((k) => k === 'customer' || /^contact:[0-9a-f-]{36}$/i.test(k)) : [];
  const channels = { email: b.channels?.email === true, whatsapp: b.channels?.whatsapp === true, sms: b.channels?.sms === true };
  if (!keys.length || !(channels.email || channels.whatsapp || channels.sms)) return json({ error: 'Pick who to send it to, and how.' }, 400);
  const { data: p } = await createAdminClient().from('crm_projects').select('enquiry_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const by = staffFrom(s);
  const lines = await sendAppointmentByHand({ projectId: id, enquiryId: p.enquiry_id as string, keys, channels, by });
  return json({ ok: true, lines });
}
