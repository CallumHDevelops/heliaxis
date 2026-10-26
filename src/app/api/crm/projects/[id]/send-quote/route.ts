import { crmSession, isUuid, json } from '@/lib/crm/server';
import { sendQuoteForSigning } from '@/lib/crm/send-quote';

export const dynamic = 'force-dynamic';

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
  const r = await sendQuoteForSigning(id, docId, { id: s.user.id, name: (s.profile.full_name || s.profile.email) as string | null });
  return r.ok ? json({ url: r.url, whatsappText: r.whatsappText, emailSubject: r.emailSubject, emailText: r.emailText }) : json({ error: r.error }, r.status);
}
