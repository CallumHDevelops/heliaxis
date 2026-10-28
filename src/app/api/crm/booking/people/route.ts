import { crmSession, json } from '@/lib/crm/server';
import { getBookingSettings } from '@/lib/booking/settings-server';
import { msConfigured } from '@/lib/ms365';
import { smsConfigured } from '@/lib/sms';
import { whatsappConfigured } from '@/lib/whatsapp/api';

export const dynamic = 'force-dynamic';

/** Who can go to appointments, and which ways of telling the customer are set up (for the "Appointment arranged" screens). */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const s = await getBookingSettings();
  return json({ surveyors: s.surveyors.map((v) => ({ key: v.key, name: v.name })), channels: { email: msConfigured(), whatsapp: whatsappConfigured(), sms: smsConfigured() } });
}
