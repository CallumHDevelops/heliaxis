import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContact } from '@/lib/organisations/shared';
import { createContact } from '@/lib/organisations/contacts-server';
import { NOT_READY, orgsReady } from '@/lib/organisations/server';

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
  const r = await createContact(createAdminClient(), clean.fields, id, clean.fields.is_primary === true, s.user.id);
  return r.ok ? json({ contact: r.contact, ...(r.warning ? { warning: r.warning } : {}) }) : json({ error: r.error }, r.status);
}
