import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContact } from '@/lib/organisations/shared';
import { CONTACT_COLS, NOT_READY, orgsReady, setPrimary } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Add a contact to an organisation. Its first contact is its primary one; `is_primary: true` makes a later one primary. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const clean = cleanContact(b && typeof b === 'object' ? b : {}, true);
  if (!clean.ok) return json({ error: clean.error, field: clean.field }, 400);
  const db = createAdminClient();
  const { data: org } = await db.from('organisations').select('id').eq('id', id).maybeSingle();
  if (!org) return json({ error: 'That organisation isn’t there any more.' }, 404);
  const { count } = await db.from('organisation_contacts').select('id', { count: 'exact', head: true }).eq('organisation_id', id).eq('is_primary', true);
  const { is_primary: wantPrimary, ...fields } = clean.fields;
  const { data, error } = await db
    .from('organisation_contacts')
    .insert({ ...fields, organisation_id: id, is_primary: false, created_by: s.user.id })
    .select(CONTACT_COLS)
    .single();
  if (error || !data) return json({ error: error?.message ?? 'Not saved. Try again.' }, 500);
  // Primary when asked, or when the organisation has none yet.
  if (wantPrimary || !count) {
    const r = await setPrimary(db, id, data.id);
    if (!r.ok) return json({ contact: data, warning: `${data.name} is saved, but not as the primary contact: ${r.error}` });
    data.is_primary = true;
  }
  await db.from('organisations').update({ updated_at: new Date().toISOString() }).eq('id', id);
  return json({ contact: data });
}
