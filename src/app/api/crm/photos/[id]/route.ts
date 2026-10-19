import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CRM_BUCKET, crmSession, isUuid, json, thumbPath } from '@/lib/crm/server';
import { PHOTO_KEYS } from '@/lib/crm/stages';
import { recomputeFlags } from '@/lib/surveys/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Change a photo's caption or type. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const u: Record<string, unknown> = {};
  if ('caption' in b) u.caption = String(b.caption ?? '').trim().slice(0, 500) || null;
  if ('category' in b) {
    if (!PHOTO_KEYS.includes(String(b.category))) return json({ error: 'Unknown type' }, 400);
    u.category = b.category;
  }
  const { error } = await createAdminClient().from('crm_photos').update(u).eq('id', id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

/** Delete a photo, its thumbnail and any drawing on it. A survey photo's survey works out its flags again. */
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  // select('*'): markup_path and survey_id only exist once surveys.sql has run.
  const { data } = await db.from('crm_photos').select('*').eq('id', id).maybeSingle();
  if (!data) return json({ ok: true });
  const paths = [data.storage_path, thumbPath(data.storage_path), data.markup_path].filter(Boolean) as string[];
  await db.storage.from(CRM_BUCKET).remove(paths);
  await db.from('crm_photos').delete().eq('id', id);
  if (data.survey_id) {
    const surveyId = data.survey_id as string;
    after(() => recomputeFlags(surveyId));
  }
  return json({ ok: true });
}
