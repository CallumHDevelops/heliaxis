import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanContact } from '@/lib/organisations/shared';
import { createContact, listContacts } from '@/lib/organisations/contacts-server';
import { NOT_READY, orgsReady } from '@/lib/organisations/server';

export const dynamic = 'force-dynamic';

/** Everyone we added (in an organisation or on their own), for CRM › Contacts, which searches and filters them in the browser. */
export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ ready: false, people: [] });
  try {
    return json({ ready: true, people: await listContacts(createAdminClient()) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t read the contacts.' }, 500);
  }
}

/**
 * Add a contact: name, and optionally role, mobile, email, notes. `organisation_id` puts them in an
 * organisation (the first one it has is its primary contact; `is_primary: true` makes a later one primary);
 * leave it out for someone on their own.
 */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await orgsReady())) return json({ error: NOT_READY }, 409);
  const b = await req.json().catch(() => ({}));
  const body = b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  const org = body.organisation_id ?? null;
  if (org !== null && !(typeof org === 'string' && isUuid(org))) return json({ error: 'Pick an organisation.', field: 'organisation_id' }, 400);
  const clean = cleanContact(body, true);
  if (!clean.ok) return json({ error: clean.error, field: clean.field }, 400);
  const r = await createContact(createAdminClient(), clean.fields, org, clean.fields.is_primary === true, s.user.id);
  return r.ok ? json({ contact: r.contact, ...(r.warning ? { warning: r.warning } : {}) }) : json({ error: r.error }, r.status);
}
