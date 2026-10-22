import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanOrganisation } from '@/lib/organisations/shared';
import { deleteOrganisation, NOT_READY, ORG_COLS, orgsReady, readOrganisation } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** One organisation: its details, contacts (primary first) and jobs. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ ready: false }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  try {
    const r = await readOrganisation(createAdminClient(), id);
    return r ? json({ ready: true, ...r }) : json({ error: 'That organisation isn’t there any more.' }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t read the organisation.' }, 500);
  }
}

/** Change an organisation's details (only the fields sent). */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const clean = cleanOrganisation(b && typeof b === 'object' ? b : {}, false);
  if (!clean.ok) return json({ error: clean.error, field: clean.field }, 400);
  const { data, error } = await createAdminClient()
    .from('organisations')
    .update({ ...clean.fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(ORG_COLS)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'That organisation isn’t there any more.' }, 404);
  return json({ organisation: data });
}

/** Delete an organisation and its contacts. Its jobs stay, unlinked (a line on each one's timeline says so). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  try {
    const r = await deleteOrganisation(createAdminClient(), id, s.user.id);
    return r ? json({ deleted: true, jobs: r.jobs }) : json({ error: 'That organisation isn’t there any more.' }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not deleted. Try again.' }, 500);
  }
}
