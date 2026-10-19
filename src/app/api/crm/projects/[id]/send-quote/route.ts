import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, ensurePortalToken, isUuid, json, logActivity, portalUrl } from '@/lib/crm/server';
import { applyStageEvent } from '@/lib/crm/move-stage';
import { SIGNABLE_CATEGORIES } from '@/lib/crm/portal';
import { SALES_STAGES } from '@/lib/crm/stages';

export const dynamic = 'force-dynamic';

const firstName = (s: string | null | undefined) => (s || '').trim().split(/[\s@]/)[0] || '';

/**
 * Send for signing: { document_id } (a quote or contract on this job). Marks that document, and
 * only that one, as the one to sign; moves the job to Quote sent; makes the customer's link, which
 * opens as a quote-only page. Returns { url, whatsappText, emailSubject, emailText }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const docId = String(b?.document_id || '');
  if (!isUuid(docId)) return json({ error: 'Pick the quote to send.' }, 400);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, stage, owner_id, accepted_at').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  if (p.accepted_at) return json({ error: 'The customer has already signed their quote.' }, 409);
  if (!(SALES_STAGES as string[]).includes(p.stage)) {
    return json(
      {
        error:
          p.stage === 'lost'
            ? 'This job is marked Lost. Move it back to a sales stage first.'
            : 'This job is already Won, so their link is the full portal. To ask them to sign something, tick “Needs signing” on it in Docs.',
      },
      400
    );
  }
  const { data: doc } = await db
    .from('crm_documents')
    .select('id, name, category')
    .eq('id', docId)
    .eq('project_id', id)
    .in('category', SIGNABLE_CATEGORIES)
    .maybeSingle();
  if (!doc) return json({ error: 'That quote isn’t on this job. Upload it under Docs as a Quote or Contract.' }, 400);

  // This document is the one they sign; any other "needs signing" mark on the job comes off.
  const { error } = await db.from('crm_documents').update({ needs_signature: true }).eq('id', doc.id);
  if (error) return json({ error: error.message }, 500);
  await db.from('crm_documents').update({ needs_signature: false }).eq('project_id', id).eq('needs_signature', true).neq('id', doc.id);

  // The stage first: the link only exists from Quote sent.
  await applyStageEvent(id, 'quote_sent', { byId: s.user.id });
  const token = await ensurePortalToken(id);
  if (!token) return json({ error: 'Couldn’t make the customer’s link. Please try again.' }, 500);
  await logActivity({ enquiryId: p.enquiry_id, projectId: id, kind: 'system', body: `Quote “${doc.name}” sent for signing`, byId: s.user.id });

  const [{ data: c }, { data: owner }] = await Promise.all([
    db.from('enquiries').select('name').eq('id', p.enquiry_id).maybeSingle(),
    p.owner_id ? db.from('profiles').select('full_name, email').eq('id', p.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const url = portalUrl(token);
  const first = firstName(c?.name as string | undefined);
  const hi = first ? `Hi ${first}` : 'Hi';
  const from = firstName((owner?.full_name || owner?.email || s.profile.full_name || s.profile.email) as string | null);
  const what = doc.category === 'contract' ? 'contract' : 'quote';
  const cancel = 'You can change your mind and cancel within 14 days of signing, free of charge.';
  return json({
    url,
    whatsappText: `${hi}, your Heliaxis ${what} is ready. You can read it and sign it on your phone here: ${url}\n\n${cancel} Any questions, just reply here.`,
    emailSubject: `Your Heliaxis ${what}`,
    emailText: `${hi},\n\nYour ${what} from Heliaxis is ready. You can read it and sign it online here:\n${url}\n\n${cancel}\n\nAny questions, just reply to this email.\n\nThanks,\n${from || 'The Heliaxis team'}\nHeliaxis`,
  });
}
