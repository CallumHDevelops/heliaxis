import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { isCustomerId } from '@/lib/crm/delete-customer';
import { MergeError, previewMerge, runMerge } from '@/lib/crm/merge';
import { resetDuplicateIndex } from '@/lib/projects/duplicates';
import type { Choices } from '@/lib/crm/merge-rules';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Merging duplicates (src/lib/crm/merge.ts). Anyone with the CRM; records with a signed quote, a paid
 * deposit or kit ordered need an admin.
 * { a, b, preview: true, choices? } → what merging would do (worked out by the database, undone), with
 *   the defaults and a `check`; changes nothing. b null with jobPair [goes, into]: two of a's jobs.
 * { a, b, choices, check, confirm?, ticked? } → merges, if nothing has changed since the preview (409 if it has).
 * { action: 'distinct', a, b } → "Not the same person": the duplicate badge leaves them alone.
 */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const a = body?.a;
  const b = body?.b ?? null;
  if (!isCustomerId(a) || (b !== null && !isCustomerId(b))) return json({ error: 'Pick two customers.' }, 400);
  const pair = Array.isArray(body?.jobPair) && body.jobPair.length === 2 && body.jobPair.every(isCustomerId) ? (body.jobPair as [string, string]) : null;
  const by = { id: s.user.id, name: s.profile.full_name?.trim() || s.profile.email?.split('@')[0] || 'Someone', admin: s.profile.role === 'admin' };

  if (body?.action === 'distinct') {
    if (!b || a === b) return json({ error: 'Pick two customers.' }, 400);
    const [x, y] = [a, b].sort();
    const { error } = await createAdminClient().from('crm_distinct_pairs').upsert({ a: x, b: y, by_id: s.user.id }, { onConflict: 'a,b', ignoreDuplicates: true });
    if (error) return json({ error: /crm_distinct_pairs/.test(error.message) ? 'This needs supabase/merge.sql (Setup → SQL).' : error.message }, 500);
    resetDuplicateIndex();
    return json({ ok: true });
  }

  const choices = (body?.choices && typeof body.choices === 'object' ? body.choices : {}) as Partial<Choices>;
  const ask = { a, b: b as string | null, choices, jobPair: pair };
  try {
    if (body?.preview === true) return json(await previewMerge(ask, by));
    if (typeof body?.check !== 'string') return json({ error: 'Look at the summary first.' }, 400);
    return json(
      await runMerge({ ...ask, check: body.check, confirm: typeof body.confirm === 'string' ? body.confirm : null, ticked: Number(body.ticked) || 0 }, by)
    );
  } catch (e) {
    if (e instanceof MergeError) return json({ error: e.message, code: e.code }, e.status);
    console.error('[merge]', e);
    return json({ error: e instanceof Error ? e.message : 'The merge didn’t work. Nothing was changed.' }, 500);
  }
}
