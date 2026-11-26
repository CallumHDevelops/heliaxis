import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { defaultTemplate, sendDocument, sendTemplate, whatsappConfigured } from '@/lib/whatsapp/api';
import { grantPermission, waPermission } from '@/lib/whatsapp/permission';
import { greetingName } from '@/lib/greeting-name';
import { REFERENCE_PATTERN } from './quote-input';

/**
 * The estimate on WhatsApp, two ways.
 *
 * 1. Sent to them straight after the PDF is made (they chose WhatsApp or Both): the first message to a customer must be a Meta-approved
 *    template, whatever they ticked. We use one Utility template with a DOCUMENT header (the PDF). It has to be created and approved once in
 *    WhatsApp Manager (the app's template screen can't make a header); after that it sends itself for every lead.
 * 2. They tap "Get it on WhatsApp now" (a wa.me link with "Please send my estimate HX-EST-…"): their message opens the 24-hour window, the
 *    webhook sees the reference and replies with the PDF as an ordinary document. No template involved.
 */

/** The template's name (override with WHATSAPP_ESTIMATE_TEMPLATE) and the words to submit for approval. */
export const estimateTemplateName = () => process.env.WHATSAPP_ESTIMATE_TEMPLATE || 'estimate_ready';
export const ESTIMATE_TEMPLATE = {
  category: 'UTILITY',
  language: 'en_GB',
  header: 'Document (PDF). Sample: any estimate PDF.',
  body: 'Hi {{1}}, here is your solar estimate from Heliaxis (ref {{2}}). Reply here with any questions or to book your free survey.',
  examples: ['Sam', 'HX-EST-ABC234'],
} as const;
/** The language the template was created in (WHATSAPP_ESTIMATE_LANG, e.g. en_US if it shows as plain "English" in WhatsApp Manager); else the account's usual one. */
export const estimateTemplateLang = () => process.env.WHATSAPP_ESTIMATE_LANG || defaultTemplate().lang || ESTIMATE_TEMPLATE.language;
const fillBody = (name: string, ref: string) => ESTIMATE_TEMPLATE.body.replace('{{1}}', name).replace('{{2}}', ref);

const windowOpen = (lastInbound: string | null) => !!lastInbound && Date.now() - new Date(lastInbound).getTime() < 24 * 3600_000;
const fileName = (ref: string) => `Heliaxis solar estimate ${ref}.pdf`;

type Row = { id: string; wa_id: string | null; wa_last_inbound_at: string | null };

async function logMessage(db: ReturnType<typeof createAdminClient>, e: { id: string }, waMessageId: string | null, kind: 'template' | 'document', body: string, template: string | null) {
  const now = new Date().toISOString();
  await db.from('whatsapp_messages').insert({ enquiry_id: e.id, wa_message_id: waMessageId, direction: 'out', kind, body, template_name: template, status: 'sent', sent_by: null, via: 'estimator-quote', created_at: now }).then(() => null, () => null);
  await db.from('enquiries').update({ wa_last_message_at: now }).eq('id', e.id).then(() => null, () => null);
}

/** Path 1: the approved template, with the PDF as its header. Never throws. */
export async function sendQuoteOnWhatsApp(a: { enquiryId: string; to: string; name: string; reference: string; pdfUrl: string | null }): Promise<{ ok: boolean; id?: string | null; error?: string | null; note?: string }> {
  try {
    if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp is not connected (WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing).' };
    if (!a.pdfUrl) return { ok: false, error: 'The PDF was not stored, so there was nothing to send.' };
    const db = createAdminClient();
    // Asking for the quote by WhatsApp is the permission to send that quote (their marketing yes is separate and was recorded first).
    await grantPermission(a.enquiryId, 'website-form');
    const permission = await waPermission(a.enquiryId);
    if (!permission.allowed) return { ok: false, error: permission.reason || 'No WhatsApp permission' };
    await db.from('enquiries').update({ wa_id: a.to }).eq('id', a.enquiryId).is('wa_id', null).then(() => null, () => null);
    const first = greetingName(a.name) || 'there';
    const name = estimateTemplateName();
    const r = await sendTemplate(a.to, name, estimateTemplateLang(), [first, a.reference], { link: a.pdfUrl, filename: fileName(a.reference) });
    if (!r.ok) {
      const { notifyEnquiryTeam } = await import('@/lib/whatsapp/inbox');
      await notifyEnquiryTeam('Estimate not sent on WhatsApp', `${a.reference}: ${r.error}`, `/admin/enquiries?enquiry=${a.enquiryId}`).catch(() => null);
      return { ok: false, error: r.error, note: `template ${name}` };
    }
    const id = r.data.messages?.[0]?.id ?? null;
    await logMessage(db, { id: a.enquiryId }, id, 'template', `${fillBody(first, a.reference)}\n📄 ${fileName(a.reference)}`, name);
    return { ok: true, id, note: `template ${name}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'WhatsApp failed' };
  }
}

/**
 * Path 2: an inbound message that quotes a reference. Replies with that estimate's PDF as a normal document (the window is open: they
 * just wrote). A reference nobody made, or an estimate with no stored PDF, gets no reply. Never throws.
 */
export async function replyWithEstimate(enquiryId: string, waId: string, text: string): Promise<boolean> {
  try {
    const ref = text.toUpperCase().match(REFERENCE_PATTERN)?.[0];
    if (!ref || !whatsappConfigured()) return false;
    const db = createAdminClient();
    const { data: q } = await db.from('estimator_quotes').select('id, pdf_path').eq('reference', ref).maybeSingle();
    if (!q?.pdf_path) return false;
    const { data: e } = await db.from('enquiries').select('id, wa_id, wa_last_inbound_at').eq('id', enquiryId).maybeSingle();
    const row = e as Row | null;
    if (!row || !windowOpen(row.wa_last_inbound_at)) return false;
    const { signedDoc } = await import('@/lib/crm/server');
    const link = await signedDoc(q.pdf_path as string, 3600, fileName(ref));
    if (!link) return false;
    const r = await sendDocument(waId, link, fileName(ref), `Here is your Heliaxis solar estimate (ref ${ref}). Reply here with any questions or to book your free survey.`);
    const { logSend } = await import('./quote-send');
    await logSend(ref, { channel: 'whatsapp', ok: r.ok, id: r.ok ? (r.data.messages?.[0]?.id ?? null) : null, error: r.ok ? null : r.error, note: 'document reply to "Please send my estimate"' });
    if (!r.ok) return false;
    await logMessage(db, row, r.data.messages?.[0]?.id ?? null, 'document', `📄 ${fileName(ref)} — Here is your Heliaxis solar estimate (ref ${ref}).`, null);
    return true;
  } catch {
    return false;
  }
}
