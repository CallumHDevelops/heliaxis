import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { PRODUCT_KEYS } from '@/lib/crm/stages';
import { customerFromContact } from '@/lib/crm/from-contact';

export const dynamic = 'force-dynamic';

/**
 * A new opportunity for a contact (someone added under CRM › Contacts, in an organisation or on their own).
 * The job belongs to a customer record, so one is made from the contact's name, mobile and email (or, if the
 * same mobile or email is already a customer, that customer is used, so nobody is entered twice). The job is
 * linked back to the contact (and their organisation) and starts at Lead. { products?, address?, postcode?, title? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const postcode = String(b.postcode || '').trim().toUpperCase().slice(0, 12) || null;
  const made = await customerFromContact(db, id, postcode);
  if (!made.ok) return json({ error: made.error }, made.status);
  const { enquiryId, reused, organisationId, name } = made;

  const products = (Array.isArray(b.products) ? b.products : []).filter((k: unknown) => PRODUCT_KEYS.includes(String(k)));
  const title = String(b.title || '').trim() || `${name}${postcode ? ` · ${postcode}` : ''}`;
  const { data: project, error } = await db
    .from('crm_projects')
    .insert({
      enquiry_id: enquiryId,
      title: title.slice(0, 140),
      products,
      address: String(b.address || '').trim().slice(0, 500) || null,
      postcode,
      owner_id: s.user.id,
      created_by: s.user.id,
      stage: 'lead',
      contact_id: id,
      organisation_id: organisationId,
    })
    .select('id')
    .single();
  if (error || !project) return json({ error: error?.message || 'Couldn’t create the opportunity' }, 500);
  // Someone we added by hand is not a new website lead: no automatic follow-ups or "not contacted" alerts.
  const now = new Date().toISOString();
  await db.from('crm_projects').update({ sequence_stopped_at: now, first_response_alerted_at: now }).eq('id', project.id).then(() => null, () => null);
  await logActivity({ enquiryId, projectId: project.id as string, kind: 'system', body: `Opportunity created from contact ${name}`, byId: s.user.id });
  return json({ id: project.id, reused });
}
