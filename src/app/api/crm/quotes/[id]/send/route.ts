import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { sendQuoteForSigning } from '@/lib/crm/send-quote';
import { docFileName } from '@/lib/documents/pdf-kit';
import { saveGenerated } from '@/lib/documents/store';
import { customerRefOf, readQuote, renderQuote } from '@/lib/quotes/server';
import { totalsOf } from '@/lib/quotes/types';
import { quoteEmailHtml } from '@/lib/quotes/email';
import { defaultQuoteMessage, firstOf, quoteSms, quoteSubject, quoteWhatsApp } from '@/lib/quotes/message';
import { msConfigured, sendMail } from '@/lib/ms365';
import { sendManual } from '@/lib/whatsapp/inbox';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { blanksFor, getBlankMap, sendableTemplates } from '@/lib/whatsapp/templates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Make the quote's PDF, put it on the job as the Quote, and send it for signing (the same flow as a
 * quote uploaded under Docs): the job moves to Quote sent and the customer's link is made. Returns the
 * link and the ready-to-send WhatsApp and email wording. Sending again after an edit replaces the PDF.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const q = await readQuote(id);
  if (!q) return json({ error: 'Not found' }, 404);
  const opts = (await req.json().catch(() => ({}))) as { email?: boolean; whatsapp?: boolean; sms?: boolean; message?: string };
  const totals = totalsOf(q.content);
  if (totals.gross <= 0) return json({ error: 'Add at least one priced item before sending.' }, 400);

  const db = createAdminClient();
  const ref = await customerRefOf(q.enquiry_id);
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
      name: docFileName(ref, 'Quote', q.number),
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
  const { data: c } = await db.from('enquiries').select('name, email, phone').eq('id', q.enquiry_id).maybeSingle();
  const name = (c?.name as string) || '';
  const message = String(opts.message || '').trim().slice(0, 3000) || defaultQuoteMessage(name, q.title);
  const sentVia: { email?: Channel; whatsapp?: Channel; sms?: Channel } = {};

  if (opts.email) {
    const to = ((c?.email as string | null) || '').trim();
    if (!to) sentVia.email = { ok: false, error: 'No email address on file.' };
    else if (!msConfigured()) sentVia.email = { ok: false, error: 'Microsoft 365 isn’t connected, so email can’t be sent.' };
    else {
      try {
        const html = quoteEmailHtml(message, r.url);
        const text = `${message}\n\nView your quote: ${r.url}`;
        const graphId = await sendMail({ to, subject: quoteSubject, text, html });
        await db.from('crm_emails').insert({ enquiry_id: q.enquiry_id, project_id: q.project_id, graph_id: graphId, direction: 'out', subject: quoteSubject, body: text.slice(0, 4000), from_address: process.env.MS_MAILBOX, to_address: to, sent_by: s.user.id, attachments: [], at: new Date().toISOString() });
        sentVia.email = { ok: true, to };
      } catch (e) {
        sentVia.email = { ok: false, error: e instanceof Error ? e.message : 'Email not sent' };
      }
    }
  }

  if (opts.whatsapp) {
    // Free wording inside their 24-hour window; otherwise the approved "Quote ready" template (fixed wording, their portal link in it).
    let w = await sendManual(q.enquiry_id, s.user.id, { text: quoteWhatsApp(message, r.url) });
    let via = 'message';
    if (!w.ok) {
      const tpl = (await sendableTemplates()).find((t) => t.name === 'quote_ready' && t.sendable);
      if (!tpl) {
        w = { ok: false as const, error: 'Their 24-hour WhatsApp window is closed and the “Quote ready” template isn’t approved yet. Send it to Meta under WhatsApp templates, or use email.' };
      } else {
        const blanks = blanksFor(tpl.name, await getBlankMap()) ?? [];
        const params = blanks.map((b) => (b.field === 'first_name' ? firstOf(name) || 'there' : b.field === 'quote_link' || b.field === 'portal_link' ? r.url : ''));
        w = await sendManual(q.enquiry_id, s.user.id, { template: tpl.name, lang: tpl.language, params });
        via = 'template';
      }
    }
    sentVia.whatsapp = w.ok ? { ok: true, via } : { ok: false, error: (w as { error: string }).error };
  }
  if (opts.sms) {
    const to = toMsisdn((c?.phone as string | null) ?? null);
    if (!to) sentVia.sms = { ok: false, error: 'No UK mobile number on file for a text.' };
    else if (!smsConfigured()) sentVia.sms = { ok: false, error: 'Text messages aren’t set up yet.' };
    else {
      const first = firstOf(name);
      const out = await sendSms(to, quoteSms(first, r.url), 'quote');
      sentVia.sms = out.ok ? { ok: true, to } : { ok: false, error: out.error };
      if (out.ok) await logActivity({ enquiryId: q.enquiry_id, projectId: q.project_id, kind: 'system', body: `Quote ${q.number} link texted to ${to}`, byId: s.user.id });
    }
  }
  return json({ ok: true, url: r.url, whatsappText: quoteWhatsApp(message, r.url), emailSubject: r.emailSubject, emailText: r.emailText, email: (c?.email as string | null) ?? null, projectId: q.project_id, enquiryId: q.enquiry_id, sentVia });
}

type Channel = { ok: true; to?: string; via?: string } | { ok: false; error: string };
