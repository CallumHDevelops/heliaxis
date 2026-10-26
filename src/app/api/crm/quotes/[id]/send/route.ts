import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { sendQuoteForSigning } from '@/lib/crm/send-quote';
import { docFileName } from '@/lib/documents/pdf-kit';
import { saveGenerated } from '@/lib/documents/store';
import { readQuote, renderQuote } from '@/lib/quotes/server';
import { totalsOf } from '@/lib/quotes/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Make the quote's PDF, put it on the job as the Quote, and send it for signing (the same flow as a
 * quote uploaded under Docs): the job moves to Quote sent and the customer's link is made. Returns the
 * link and the ready-to-send WhatsApp and email wording. Sending again after an edit replaces the PDF.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const q = await readQuote(id);
  if (!q) return json({ error: 'Not found' }, 404);
  const totals = totalsOf(q.content);
  if (totals.gross <= 0) return json({ error: 'Add at least one priced item before sending.' }, 400);

  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('project_ref').eq('id', q.project_id).maybeSingle();
  let bytes: Uint8Array;
  try {
    bytes = await renderQuote(q);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t make the PDF' }, 500);
  }
  let docId: string;
  try {
    const saved = await saveGenerated(db, q.project_id, {
      key: q.number,
      name: docFileName((p?.project_ref as string | null) ?? null, 'Quote', q.number),
      bytes,
      inputs: { content: q.content, valid_until: q.valid_until, deposit: q.deposit_pence, title: q.title, at: Date.now() },
      category: 'quote',
      visible: false,
      force: true,
      by: s.user.id,
    });
    docId = saved.doc.id;
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t save the quote' }, 500);
  }

  const r = await sendQuoteForSigning(q.project_id, docId, { id: s.user.id, name: (s.profile.full_name || s.profile.email) as string | null });
  if (!r.ok) return json({ error: r.error }, r.status);

  const now = new Date().toISOString();
  await db.from('crm_quotes').update({ status: 'sent', document_id: docId, sent_at: now, updated_at: now }).eq('id', id);
  // The job's value and the deposit the portal asks for once they sign.
  await db
    .from('crm_projects')
    .update({ value: Math.round(totals.gross) / 100, ...(q.deposit_pence ? { deposit_amount: q.deposit_pence / 100 } : {}), updated_at: now })
    .eq('id', q.project_id);
  await logActivity({ enquiryId: q.enquiry_id, projectId: q.project_id, kind: 'system', body: `Quote ${q.number} sent for signing`, byId: s.user.id });
  const { data: c } = await db.from('enquiries').select('email, phone').eq('id', q.enquiry_id).maybeSingle();
  return json({ ok: true, url: r.url, whatsappText: r.whatsappText, emailSubject: r.emailSubject, emailText: r.emailText, email: (c?.email as string | null) ?? null, projectId: q.project_id, enquiryId: q.enquiry_id });
}
