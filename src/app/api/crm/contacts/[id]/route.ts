import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContact } from '@/lib/organisations/shared';
import { removeContact, readContact, updateContact } from '@/lib/organisations/contacts-server';
import { NOT_READY, orgsReady } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** One contact: their details, organisation (if any), WhatsApp chat (when their number has one) and the jobs they're dealt with through. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ ready: false }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  try {
    const r = await readContact(createAdminClient(), id);
    return r ? json({ ready: true, ...r }) : json({ error: 'That contact isn’t there any more.' }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t read the contact.' }, 500);
  }
}

/**
 * Change a contact (only the fields sent). `organisation_id` moves them into that organisation, or, as null,
 * out onto their own: the jobs they're dealt with through go with them. `is_primary: true` makes them
 * their organisation's primary contact.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const body = b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  let move: { orgId: string | null } | null = null;
  if ('organisation_id' in body) {
    const org = body.organisation_id ?? null;
    if (org !== null && !(typeof org === 'string' && isUuid(org))) return json({ error: 'Pick an organisation.', field: 'organisation_id' }, 400);
    move = { orgId: org as string | null };
  }
  const clean = cleanContact(body, false);
  if (!clean.ok) return json({ error: clean.error, field: clean.field }, 400);
  const r = await updateContact(createAdminClient(), id, clean.fields, move, s.user.id);
  if (!r.ok) return json({ error: r.error }, r.status);
  return json({
    contact: r.contact,
    jobsMoved: r.jobsMoved,
    ...(r.jobsFailed ? { warning: `${r.contact.name} is moved, but ${r.jobsFailed} of their jobs couldn’t be moved with them. Open each one and change its organisation.` } : {}),
  });
}

/** Delete a contact. Jobs dealt with through them stay, keeping their organisation. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const r = await removeContact(createAdminClient(), id);
  return r.ok ? json({ deleted: true, primary: r.primary }) : json({ error: r.error }, r.status);
}
