import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchLead } from './api';
import { inboxHref, notifyEnquiryTeam, queueFirstContact } from './inbox';
import { leadToEnquiry } from './leads';
import { toWaId } from './shared';
import { ensureOpportunity } from '@/lib/crm/server';

/** A Lead Ads webhook ping → fetch the answers → an enquiry (once, however often Meta retries). */
export async function ingestLead(leadgenId: string) {
  const db = createAdminClient();
  const { data: existing } = await db.from('enquiries').select('id').eq('meta_lead_id', leadgenId).maybeSingle();
  if (existing) return;

  const r = await fetchLead(leadgenId);
  if (!r.ok) {
    console.error('Meta lead fetch failed', leadgenId, r.error);
    await notifyEnquiryTeam(
      'Meta lead could not be fetched',
      `Lead ${leadgenId}: ${r.error}. Check META_PAGE_ACCESS_TOKEN.`,
      '/admin/enquiries'
    );
    return;
  }
  const { lead, interest, source, whatsappOptIn: optIn } = leadToEnquiry(
    r.data.field_data ?? [],
    r.data.ad_name,
    process.env.META_LEADS_WHATSAPP_OPT_IN === 'true'
  );

  const { data: row, error } = await db
    .from('enquiries')
    .insert({
      name: lead.name || 'Meta lead',
      email: lead.email,
      phone: lead.phone || null,
      postcode: lead.postcode || null,
      interest,
      source,
      meta_lead_id: leadgenId,
      wa_id: toWaId(lead.phone),
      whatsapp_opt_in: optIn,
      created_at: r.data.created_time ? new Date(r.data.created_time).toISOString() : undefined,
    })
    .select('id')
    .single();
  if (error || !row) {
    if (error?.code !== '23505') console.error('Meta lead insert failed', error?.message);
    return;
  }

  await ensureOpportunity(row.id, r.data.ad_name ? `Meta ad “${r.data.ad_name}”` : 'Meta lead form');
  const queued = optIn && toWaId(lead.phone) ? await queueFirstContact(row.id, lead.name) : false;
  await notifyEnquiryTeam(
    `New Meta lead: ${lead.name || 'unnamed'}`,
    [lead.interest, lead.postcode, queued ? 'WhatsApp intro sends in a few minutes.' : ''].filter(Boolean).join(' · '),
    optIn ? inboxHref(row.id) : '/admin/enquiries'
  );
}
