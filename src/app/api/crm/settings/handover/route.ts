import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { upcomingGaps } from '@/lib/handover/library';
import { handoverReady } from '@/lib/handover/server';
import { getHandoverSettings, saveHandoverSettings } from '@/lib/handover/settings';
import { cleanHandoverSettings, DRAFTS, type DraftKey } from '@/lib/handover/settings-shared';

export const dynamic = 'force-dynamic';

/** Handover pack settings (CRM settings → Handover pack), with the drafts the owner approves and the library's gaps. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const ready = await handoverReady();
  return json({ settings: await getHandoverSettings(), drafts: DRAFTS, ready, gaps: ready ? await upcomingGaps(createAdminClient()).catch(() => []) : [] });
}

/**
 * Admins only: the warranty, next inspection, maintenance wording and rows. { approve: 'cover' }
 * approves that draft's current version (recorded with who and when); { unapprove: 'cover' } takes it back.
 */
export async function PUT(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can change the handover pack settings.' }, 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getHandoverSettings();
  const approved = { ...current.approved };
  const key = String(b.approve ?? b.unapprove ?? '') as DraftKey;
  if (key in DRAFTS) {
    if (b.approve) approved[key] = { version: DRAFTS[key].version, at: new Date().toISOString(), by: s.profile.full_name || s.profile.email || null };
    else delete approved[key];
  }
  const rest = { ...b };
  delete rest.approve;
  delete rest.unapprove;
  const next = cleanHandoverSettings({ ...current, ...rest, approved });
  try {
    await saveHandoverSettings(next);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
  return json({ settings: next, drafts: DRAFTS });
}
