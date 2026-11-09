import 'server-only';
import { toWaId } from '@/lib/whatsapp/shared';
import type { createAdminClient } from '@/lib/supabase/admin';

type Db = ReturnType<typeof createAdminClient>;

/**
 * The customer record for a job started for an organisation (CRM › Organisations), so the job can be made. The customer IS the organisation
 * ("Pedal Power", not the person), and the person to deal with is the job's contact: the one chosen, else the organisation's primary
 * contact. A new customer is made with the organisation's name and the contact's mobile and email (the organisation's own when there is no
 * contact), so calls and WhatsApps reach a person. If that mobile or email already belongs to a customer, that customer is used (one chat
 * per number: nobody is entered twice). Returns what the job links back to.
 */
export async function customerFromOrganisation(
  db: Db,
  organisationId: string,
  postcode: string | null,
  contactId?: string | null
): Promise<{ ok: true; enquiryId: string; organisationId: string; contactId: string | null; name: string } | { ok: false; status: number; error: string }> {
  const { data: o } = await db.from('organisations').select('id, name, phone, email, postcode').eq('id', organisationId).maybeSingle();
  if (!o) return { ok: false, status: 404, error: 'Organisation not found' };
  type Person = { id: string; mobile: string | null; email: string | null };
  let c = null as Person | null;
  if (contactId) {
    const { data } = await db.from('crm_contacts').select('id, mobile, email').eq('id', contactId).eq('organisation_id', organisationId).maybeSingle();
    c = (data as Person | null) ?? null;
  } else {
    const { data } = await db.from('crm_contacts').select('id, mobile, email').eq('organisation_id', organisationId).eq('is_primary', true).limit(1);
    c = ((data ?? [])[0] as Person | undefined) ?? null;
  }
  const name = o.name as string;
  const phone = ((c?.mobile ?? '') || (o.phone as string | null) || '').trim() || null;
  const email = ((c?.email ?? '') || (o.email as string | null) || '').trim();
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
  if (enquiryId) return { ok: true, enquiryId, organisationId, contactId: c?.id ?? null, name };
  const { data, error } = await db
    .from('enquiries')
    .insert({ name, email, phone, postcode: postcode || (o.postcode as string | null), wa_id: waId, source: 'crm', status: 'contacted' })
    .select('id')
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message || 'Couldn’t add the organisation as a customer.' };
  return { ok: true, enquiryId: data.id as string, organisationId, contactId: c?.id ?? null, name };
}
