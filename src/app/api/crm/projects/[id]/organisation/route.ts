import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { linkJob, NOT_READY, orgsReady } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * Link the job to an organisation and/or the contact it's dealt with through: { organisation_id, contact_id }.
 * A key left out leaves what the job has; null clears it; an id sets it. A contact in an organisation
 * brings it along; a contact on their own can go with any organisation or none. Both null unlinks it.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  // Left out: as the job has it. null: cleared. An id: set.
  const org = b && 'organisation_id' in b ? (b.organisation_id ?? null) : undefined;
  const contact = b && 'contact_id' in b ? (b.contact_id ?? null) : undefined;
  if (org !== undefined && org !== null && !(typeof org === 'string' && isUuid(org))) return json({ error: 'Pick an organisation.' }, 400);
  if (contact !== undefined && contact !== null && !(typeof contact === 'string' && isUuid(contact))) return json({ error: 'Pick a contact.' }, 400);
  if (org === undefined && contact === undefined) return json({ error: 'Say what to link.' }, 400);
  const r = await linkJob(createAdminClient(), id, org, contact, s.user.id);
  return r.ok ? json({ organisation: r.organisation, contact: r.contact }) : json({ error: r.error }, r.status);
}
