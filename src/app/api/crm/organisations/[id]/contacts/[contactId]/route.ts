import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContact } from '@/lib/organisations/shared';
import { removeContact, updateContact } from '@/lib/organisations/contacts-server';
import { CONTACT_COLS, NOT_READY, orgsReady } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; contactId: string }> };

/** The contact, if it's this organisation's (the two ids in the address must belong together). */
async function contactOf(id: string, contactId: string) {
  const { data } = await createAdminClient().from('crm_contacts').select(CONTACT_COLS).eq('id', contactId).eq('organisation_id', id).maybeSingle();
  return data;
}

/** Change one of the organisation's contacts; `is_primary: true` makes them the primary contact (a primary contact is replaced, never just unmarked). */
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
  const r = await updateContact(createAdminClient(), contactId, clean.fields, null, s.user.id);
  return r.ok ? json({ contact: r.contact }) : json({ error: r.error }, r.status);
}

/** Delete one of the organisation's contacts; if they were the primary contact, the one added first of those left takes over. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id, contactId } = await params;
  if (!isUuid(id) || !isUuid(contactId)) return json({ error: 'Not found' }, 404);
  if (!(await contactOf(id, contactId))) return json({ error: 'That contact isn’t there any more.' }, 404);
  const r = await removeContact(createAdminClient(), contactId);
  return r.ok ? json({ deleted: true, primary: r.primary }) : json({ error: r.error }, r.status);
}
