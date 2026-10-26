import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensurePortalToken, logActivity, portalUrl } from '@/lib/crm/server';
import { applyStageEvent } from '@/lib/crm/move-stage';
import { quoteMessages, SIGNABLE_CATEGORIES } from '@/lib/crm/portal';
import { SALES_STAGES } from '@/lib/crm/stages';

const firstName = (s: string | null | undefined) => (s || '').trim().split(/[\s@]/)[0] || '';

export type SendResult =
  | { ok: true; url: string; whatsappText: string; emailSubject: string; emailText: string }
  | { ok: false; status: number; error: string };

/**
 * Send a quote or contract on a job for signing: that document, and only that one, is marked "needs
 * signing"; the job moves to Quote sent; the customer's link is made (a quote-only page). Used by the
 * job's own "Send for signing" and by the quote builder.
 */
export async function sendQuoteForSigning(projectId: string, docId: string, by: { id: string; name: string | null }): Promise<SendResult> {
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, stage, owner_id, accepted_at').eq('id', projectId).maybeSingle();
  if (!p) return { ok: false, status: 404, error: 'Not found' };
  if (p.accepted_at) return { ok: false, status: 409, error: 'The customer has already signed their quote.' };
  if (!(SALES_STAGES as string[]).includes(p.stage)) {
    return {
      ok: false,
      status: 400,
      error:
        p.stage === 'lost'
          ? 'This job is marked Lost. Move it back to a sales stage first.'
          : 'This job is already Won, so their link is the full portal. To ask them to sign something, set it to “In portal” and tick “Needs signing” on it in Docs.',
    };
  }
  const { data: doc } = await db.from('crm_documents').select('id, name, category').eq('id', docId).eq('project_id', projectId).in('category', SIGNABLE_CATEGORIES).maybeSingle();
  if (!doc) return { ok: false, status: 400, error: 'That quote isn’t on this job. Upload it under Docs as a Quote or Contract.' };

  const { error } = await db.from('crm_documents').update({ needs_signature: true }).eq('id', doc.id);
  if (error) return { ok: false, status: 500, error: error.message };
  await db.from('crm_documents').update({ needs_signature: false }).eq('project_id', projectId).eq('needs_signature', true).neq('id', doc.id);

  await applyStageEvent(projectId, 'quote_sent', { byId: by.id });
  const token = await ensurePortalToken(projectId);
  if (!token) return { ok: false, status: 500, error: 'Couldn’t make the customer’s link. Please try again.' };
  await logActivity({ enquiryId: p.enquiry_id, projectId, kind: 'system', body: `Quote “${doc.name}” sent for signing`, byId: by.id });

  const [{ data: c }, { data: owner }] = await Promise.all([
    db.from('enquiries').select('name').eq('id', p.enquiry_id).maybeSingle(),
    p.owner_id ? db.from('profiles').select('full_name, email').eq('id', p.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const url = portalUrl(token);
  const from = firstName((owner?.full_name || owner?.email || by.name) as string | null);
  return { ok: true, url, ...quoteMessages({ first: firstName(c?.name as string | undefined), url, category: doc.category as string, from }) };
}
