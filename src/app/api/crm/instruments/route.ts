import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { cleanInstrument } from '@/lib/instruments/shared';

export const dynamic = 'force-dynamic';

/** The business's test instruments, those running out of calibration first. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { data, error } = await createAdminClient().from('test_instruments').select('*').order('status').order('calibration_due', { nullsFirst: false }).order('name').limit(500);
  if (error) return json({ error: error.message, missing: /test_instruments/.test(error.message) }, 500);
  return json({ instruments: data ?? [] });
}

/** Add one: { name, kind, make, model, serial, asset_no, calibrated_on, calibration_due, cert_no, calibrated_by, assigned_to, notes }. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const c = cleanInstrument((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!c.name) return json({ error: 'Give it a name, e.g. “Megger MFT1741”.' }, 400);
  const { data, error } = await createAdminClient().from('test_instruments').insert({ ...c, created_by: s.user.id }).select('*').single();
  if (error) return json({ error: error.message }, 500);
  return json({ instrument: data });
}
