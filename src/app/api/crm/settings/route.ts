import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { getCrmSettings, saveCrmSettings } from '@/lib/crm/crm-settings';
import { sequenceChanged } from '@/lib/crm/automation';
import { cleanCrmSettings, sequenceAfterSave, stepsWithSavedIds } from '@/lib/crm/settings-shared';
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
  const body = await req.json().catch(() => ({}));
  // A page opened before steps had ids: its steps are the saved ones, or it has to be reloaded (settings-shared.ts).
  if (Array.isArray(body?.sequence)) {
    body.sequence = stepsWithSavedIds(body.sequence, current.sequence);
    if (!body.sequence) return json({ error: 'The app has been updated since this page was opened. Reload the page, make your changes again and save.' }, 409);
  }
  const next = cleanCrmSettings({ ...current, ...body, rotationIndex: current.rotationIndex });
  // Switched on, or a step added: it only goes to leads it falls due for from now on (automation.ts).
  next.sequence = sequenceAfterSave(current, next, new Date());
  try {
    await saveCrmSettings(next);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
  // A step added or removed: a lead past the end of the new list, with a step in it still to come, is found again (automation.ts).
  await sequenceChanged(current.sequence, next.sequence);
  return json({ settings: next });
}
