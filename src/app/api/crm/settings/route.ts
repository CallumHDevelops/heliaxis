import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { getCrmSettings, saveCrmSettings } from '@/lib/crm/crm-settings';
import { cleanCrmSettings, sequenceFromAfter } from '@/lib/crm/settings-shared';
import { canAccess } from '@/lib/portals';
import { msConfigured, mailbox } from '@/lib/ms365';
import { whatsappConfigured } from '@/lib/whatsapp/api';
import { stripeConfigured } from '@/lib/stripe';
import { capiConfigured } from '@/lib/meta-capi';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { data: people } = await createAdminClient().from('profiles').select('*').eq('status', 'approved');
  return json({
    settings: await getCrmSettings(),
    team: (people ?? []).filter((p) => canAccess(p, 'crm')).map((p) => ({ id: p.id, name: p.full_name || p.email })),
    connected: {
      whatsapp: whatsappConfigured(),
      email: msConfigured() ? mailbox() : null,
      stripe: stripeConfigured(),
      meta: capiConfigured(),
    },
  });
}

/** Admins only: these change what's sent to customers automatically. */
export async function PUT(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can change CRM settings.' }, 403);
  const current = await getCrmSettings();
  const next = cleanCrmSettings({ ...current, ...(await req.json().catch(() => ({}))), rotationIndex: current.rotationIndex });
  // Switched on or a step added: only steps that fall due from now on are sent (automation.ts).
  next.sequenceFrom = sequenceFromAfter(current, next, new Date());
  try {
    await saveCrmSettings(next);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
  return json({ settings: next });
}
