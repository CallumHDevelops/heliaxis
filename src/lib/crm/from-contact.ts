import 'server-only';
import { toWaId } from '@/lib/whatsapp/shared';
import type { createAdminClient } from '@/lib/supabase/admin';

type Db = ReturnType<typeof createAdminClient>;

/**
 * The customer record for someone added under CRM › Contacts, so a job can be made for them. If their mobile or
 * email already belongs to a customer, that customer is used (nobody is entered twice); otherwise one is made from
 * the contact's name, mobile and email. Returns the customer, and the contact's organisation to link the job to.
 */
export async function customerFromContact(db: Db, contactId: string, postcode: string | null): Promise<{ ok: true; enquiryId: string; reused: boolean; organisationId: string | null; name: string } | { ok: false; status: number; error: string }> {
  const { data: c } = await db.from('crm_contacts').select('id, name, mobile, email, organisation_id').eq('id', contactId).maybeSingle();
  if (!c) return { ok: false, status: 404, error: 'Contact not found' };
  const phone = ((c.mobile as string | null) || '').trim() || null;
  const email = ((c.email as string | null) || '').trim();
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
  const org = (c.organisation_id as string | null) ?? null;
  if (enquiryId) return { ok: true, enquiryId, reused: true, organisationId: org, name: c.name as string };
  const { data, error } = await db.from('enquiries').insert({ name: c.name, email, phone, postcode, wa_id: waId, source: 'crm', status: 'contacted' }).select('id').single();
  if (error || !data) return { ok: false, status: 500, error: error?.message || 'Couldn’t add them as a customer.' };
  return { ok: true, enquiryId: data.id as string, reused: false, organisationId: org, name: c.name as string };
}
