import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContact } from '@/lib/organisations/shared';
import { CONTACT_COLS, NOT_READY, orgsReady, promoteNext, setPrimary } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; contactId: string }> };

/** The contact, if it's this organisation's (the two ids in the address must belong together). */
async function contactOf(id: string, contactId: string) {
  const { data } = await createAdminClient().from('organisation_contacts').select(CONTACT_COLS).eq('id', contactId).eq('organisation_id', id).maybeSingle();
  return data;
}

/** Change a contact's details; `is_primary: true` makes them the primary contact (a primary contact is replaced, never just unmarked). */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id, contactId } = await params;
  if (!isUuid(id) || !isUuid(contactId)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const clean = cleanContact(b && typeof b === 'object' ? b : {}, false);
  if (!clean.ok) return json({ error: clean.error, field: clean.field }, 400);
  if (!(await contactOf(id, contactId))) return json({ error: 'That contact isn’t there any more.' }, 404);
  const db = createAdminClient();
  const { is_primary: makePrimary, ...fields } = clean.fields;
  if (Object.keys(fields).length) {
    const { error } = await db
      .from('organisation_contacts')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('organisation_id', id);
    if (error) return json({ error: error.message }, 500);
  }
  if (makePrimary === true) {
    const r = await setPrimary(db, id, contactId);
    if (!r.ok) return json({ error: r.error }, 409);
  }
  await db.from('organisations').update({ updated_at: new Date().toISOString() }).eq('id', id);
  return json({ contact: await contactOf(id, contactId) });
}

/**
 * Remove a contact. Jobs dealt with through them keep their organisation (the contact link goes); if
 * they were the primary contact, the one added first of those left takes over.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id, contactId } = await params;
  if (!isUuid(id) || !isUuid(contactId)) return json({ error: 'Not found' }, 404);
  const c = await contactOf(id, contactId);
  if (!c) return json({ error: 'That contact isn’t there any more.' }, 404);
  const db = createAdminClient();
  const { error } = await db.from('organisation_contacts').delete().eq('id', contactId).eq('organisation_id', id);
  if (error) return json({ error: error.message }, 500);
  const primary = c.is_primary ? await promoteNext(db, id) : null;
  await db.from('organisations').update({ updated_at: new Date().toISOString() }).eq('id', id);
  return json({ deleted: true, primary });
}
