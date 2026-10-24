import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchLead } from './api';
import { inboxHref, notifyEnquiryTeam, queueFirstContact } from './inbox';
import { formAsksWhatsApp, leadToEnquiry } from './leads';
import { grantPermission } from './permission';
import { toWaId } from './shared';
import { ensureOpportunity } from '@/lib/crm/server';
import { leadRef } from '@/lib/notification-refs';
import { isTestLead } from '@/lib/meta-leads-csv';
import { saveAdIds } from '@/lib/meta-ads';
import { mergedInto } from '@/lib/crm/aliases';
import { atWords } from './schedule';

/** A Lead Ads webhook ping → fetch the answers → an enquiry (once, however often Meta retries). */
export async function ingestLead(leadgenId: string) {
  const db = createAdminClient();
  const { data: existing } = await db.from('enquiries').select('id').eq('meta_lead_id', leadgenId).maybeSingle();
  if (existing) return;
  // Merged into another customer (src/lib/crm/merge.ts): a webhook retry mustn't bring the old record back.
  if (await mergedInto('meta_lead', leadgenId, db)) return;

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
  // Meta's Lead Ads Testing Tool: say it arrived, but keep it out of Enquiries (as the import does).
  if (isTestLead(r.data.field_data ?? [])) {
    await notifyEnquiryTeam('Meta test lead arrived ✓', 'Live leads are working. Test leads aren’t added to Enquiries.', '/admin/enquiries/import', {
      tag: `meta-test-${leadgenId}`,
    });
    return;
  }
  const { lead, interest, source, whatsappOptIn: optIn, optInSource } = leadToEnquiry(
    r.data.field_data ?? [],
    r.data.ad_name,
    process.env.META_LEADS_WHATSAPP_OPT_IN === 'true' || formAsksWhatsApp(r.data.form_id, process.env.META_LEADS_WHATSAPP_OPT_IN_FORMS),
    r.data.is_organic === true
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
  // Which ad it came from, for the ad spend in Reports (ad-spend.sql columns; a no-op before it's run).
  await saveAdIds(row.id, r.data);

  // When and how they agreed (crm-v3.sql columns; a separate step so the lead is saved without them).
  if (optInSource) await grantPermission(row.id, optInSource, { at: r.data.created_time ? new Date(r.data.created_time).toISOString() : undefined });
  await ensureOpportunity(row.id, r.data.ad_name ? `Meta ad “${r.data.ad_name}”` : 'Meta lead form');
  // Their first WhatsApp, by the ad (video) they came from: Meta's id for it and its name now.
  const queued = optIn && toWaId(lead.phone) ? await queueFirstContact(row.id, lead.name, { id: r.data.ad_id, names: [r.data.ad_name] }) : null;
  await notifyEnquiryTeam(
    `New Meta lead: ${lead.name || 'unnamed'}`,
    [lead.interest, lead.postcode, queued ? `WhatsApp first message (“${queued.template}”) goes at ${atWords(queued.at, new Date())}.` : '']
      .filter(Boolean)
      .join(' · '),
    optIn ? inboxHref(row.id) : '/admin/enquiries',
    { ref: leadRef(row.id) }
  );
}
