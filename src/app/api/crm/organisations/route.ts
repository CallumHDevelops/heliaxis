import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { cleanContact, cleanOrganisation } from '@/lib/organisations/shared';
import { CONTACT_COLS, listOrganisations, NOT_READY, ORG_COLS, orgsReady } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';

/** Every organisation with its counts and primary contact (CRM › Organisations searches and filters them in the browser). */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ ready: false, organisations: [] });
  try {
    return json({ ready: true, organisations: await listOrganisations(createAdminClient()) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t read the organisations.' }, 500);
  }
}

/** Add an organisation, and optionally its first contact (`contact`: name, role, mobile, email), who is its primary contact. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const b = await req.json().catch(() => ({}));
  const clean = cleanOrganisation(b && typeof b === 'object' ? b : {}, true);
  if (!clean.ok) return json({ error: clean.error, field: clean.field }, 400);
  const first = b?.contact && typeof b.contact === 'object' && String(b.contact.name ?? '').trim() ? cleanContact(b.contact, true) : null;
  if (first && !first.ok) return json({ error: first.error, field: `contact.${first.field}` }, 400);

  const db = createAdminClient();
  const { data, error } = await db
    .from('organisations')
    .insert({ ...clean.fields, created_by: s.user.id })
    .select(ORG_COLS)
    .single();
  if (error || !data) return json({ error: error?.message ?? 'Not saved. Try again.' }, 500);
  let contact = null;
  if (first?.ok) {
    const r = await db
      .from('crm_contacts')
      .insert({ ...first.fields, organisation_id: data.id, is_primary: true, created_by: s.user.id })
      .select(CONTACT_COLS)
      .single();
    // The organisation is saved either way: the contact can be added again from its page.
    contact = r.data ?? null;
    if (r.error) return json({ organisation: data, warning: `${data.name} is saved, but not its contact: ${r.error.message}` });
  }
  return json({ organisation: data, contact });
}
