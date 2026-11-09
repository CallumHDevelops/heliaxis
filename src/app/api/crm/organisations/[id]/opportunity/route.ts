import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { PRODUCT_KEYS } from '@/lib/crm/stages';
import { customerFromContact } from '@/lib/crm/from-contact';
import { customerFromOrganisation } from '@/lib/crm/from-organisation';

export const dynamic = 'force-dynamic';

/**
 * A new opportunity for an organisation (CRM › Organisations). It is for one of its contacts when `contact_id` names one, otherwise for its
 * primary contact, otherwise for the organisation itself; either way the job is linked to the organisation (and the contact) and starts at
 * Lead. { products?, address?, postcode?, title?, contact_id? } → { id }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const postcode = String(b.postcode || '').trim().toUpperCase().slice(0, 12) || null;

  let enquiryId: string;
  let contactId: string | null = null;
  let name: string;
  const chosen = b.contact_id && isUuid(String(b.contact_id)) ? String(b.contact_id) : '';
  if (chosen) {
    // Only one of this organisation's own contacts.
    const { data: c } = await db.from('crm_contacts').select('id').eq('id', chosen).eq('organisation_id', id).maybeSingle();
    if (!c) return json({ error: 'That person isn’t one of this organisation’s contacts.' }, 400);
    const made = await customerFromContact(db, chosen, postcode);
    if (!made.ok) return json({ error: made.error }, made.status);
    enquiryId = made.enquiryId;
    contactId = chosen;
    name = made.name;
  } else {
    const made = await customerFromOrganisation(db, id, postcode);
    if (!made.ok) return json({ error: made.error }, made.status);
    enquiryId = made.enquiryId;
    contactId = made.contactId;
    const { data: o } = await db.from('organisations').select('name').eq('id', id).maybeSingle();
    name = (o?.name as string | undefined) ?? 'Organisation';
  }

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
      organisation_id: id,
      ...(contactId ? { contact_id: contactId } : {}),
    })
    .select('id')
    .single();
  if (error || !project) return json({ error: error?.message || 'Couldn’t create the opportunity' }, 500);
  // Added by hand, so no automatic new-lead follow-ups or "not contacted" alerts.
  const now = new Date().toISOString();
  await db.from('crm_projects').update({ sequence_stopped_at: now, first_response_alerted_at: now }).eq('id', project.id).then(() => null, () => null);
  await logActivity({ enquiryId, projectId: project.id as string, kind: 'system', body: `Opportunity created from organisation ${name}`, byId: s.user.id });
  return json({ id: project.id });
}
