import { crmSession, json } from '@/lib/crm/server';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';

export const dynamic = 'force-dynamic';

/** Admins only: /api/admin/sms-test?to=07700900123 sends one test text, and says what The SMS Works answered. */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s || s.profile.role !== 'admin') return json({ error: 'Admins only.' }, 403);
  if (!smsConfigured()) return json({ ok: false, error: 'SMSWORKS_CUSTOMER_ID, SMSWORKS_KEY and SMSWORKS_SECRET are not all set on this deployment (redeploy after adding them).' });
  const to = new URL(req.url).searchParams.get('to') || '';
  if (!toMsisdn(to)) return json({ ok: false, error: 'Add ?to=your UK mobile, e.g. /api/admin/sms-test?to=07700900123' });
  const r = await sendSms(to, 'Test from Heliaxis: text messages are working.', 'heliaxis-test');
  return json(r);
}
