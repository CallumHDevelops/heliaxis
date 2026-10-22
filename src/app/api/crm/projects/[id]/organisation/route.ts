import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { linkJob, NOT_READY, orgsReady } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * Link the job to an organisation and the contact there it's dealt with through:
 * { organisation_id, contact_id } (contact_id may be null); { organisation_id: null } unlinks it.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const org = b?.organisation_id ?? null;
  const contact = b?.contact_id ?? null;
  if (org !== null && !(typeof org === 'string' && isUuid(org))) return json({ error: 'Pick an organisation.' }, 400);
  if (contact !== null && !(typeof contact === 'string' && isUuid(contact))) return json({ error: 'Pick a contact.' }, 400);
  const r = await linkJob(createAdminClient(), id, org, contact, s.user.id);
  return r.ok ? json({ organisation: r.organisation }) : json({ error: r.error }, r.status);
}
