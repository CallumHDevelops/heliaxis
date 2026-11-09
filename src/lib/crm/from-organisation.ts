import 'server-only';
import { toWaId } from '@/lib/whatsapp/shared';
import type { createAdminClient } from '@/lib/supabase/admin';
import { customerFromContact } from './from-contact';

type Db = ReturnType<typeof createAdminClient>;

/**
 * The customer record for a job started for an organisation (CRM › Organisations), so the job can be made. With a primary contact the
 * job is for them (their details, as for a contact); otherwise a customer is made from the organisation's own name, phone and email
 * (or an existing one with the same phone or email is used: nobody is entered twice). Returns what the job links back to.
 */
export async function customerFromOrganisation(
  db: Db,
  organisationId: string,
  postcode: string | null
): Promise<{ ok: true; enquiryId: string; organisationId: string; contactId: string | null } | { ok: false; status: number; error: string }> {
  const { data: o } = await db.from('organisations').select('id, name, phone, email, postcode').eq('id', organisationId).maybeSingle();
  if (!o) return { ok: false, status: 404, error: 'Organisation not found' };
  const { data: primary } = await db.from('crm_contacts').select('id').eq('organisation_id', organisationId).eq('is_primary', true).limit(1);
  const contactId = (primary?.[0]?.id as string | undefined) ?? null;
  if (contactId) {
    const made = await customerFromContact(db, contactId, postcode || (o.postcode as string | null));
    if (made.ok) return { ok: true, enquiryId: made.enquiryId, organisationId, contactId };
  }
  const phone = ((o.phone as string | null) || '').trim() || null;
  const email = ((o.email as string | null) || '').trim();
  const waId = toWaId(phone);
  let enquiryId: string | null = null;
  if (waId) {
    const { data } = await db.from('enquiries').select('id').eq('wa_id', waId).order('created_at', { ascending: false }).limit(1);
    enquiryId = (data?.[0]?.id as string | undefined) ?? null;
  }
  if (!enquiryId && email) {
    const { data } = await db.from('enquiries').select('id').ilike('email', email).order('created_at', { ascending: false }).limit(1);
    enquiryId = (data?.[0]?.id as string | undefined) ?? null;
  }
  if (enquiryId) return { ok: true, enquiryId, organisationId, contactId: null };
  const { data, error } = await db
    .from('enquiries')
    .insert({ name: o.name, email, phone, postcode: postcode || (o.postcode as string | null), wa_id: waId, source: 'crm', status: 'contacted' })
    .select('id')
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message || 'Couldn’t add the organisation as a customer.' };
  return { ok: true, enquiryId: data.id as string, organisationId, contactId: null };
}
