import 'server-only';
import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCS_BUCKET, ensureDocsBucket, signedDoc } from '@/lib/crm/server';
import { msConfigured, sendMail } from '@/lib/ms365';
import { emailShell, stackedRows } from '@/lib/email-brand';
import { SITE_URL } from './copy';
import { makeEstimatePdf } from './quote-pdf';
import { quoteEmail } from './quote-email';
import type { QuoteFacts } from './quote-facts';
import { unsubscribeUrl } from './unsubscribe';
import { sendQuoteOnWhatsApp } from './quote-whatsapp';
import type { Delivery } from './quote-input';

export type SendLog = { channel: 'email' | 'whatsapp' | 'team-email'; at: string; ok: boolean; id?: string | null; error?: string | null; note?: string };

/** Adds a line to the quote's send log (what went by email and WhatsApp, and what failed), on the quote and in the server log. Never throws. */
export async function logSend(reference: string, entry: Omit<SendLog, 'at'>) {
  try {
    const db = createAdminClient();
    const { data } = await db.from('estimator_quotes').select('id, sends').eq('reference', reference).maybeSingle();
    if (!data) return;
    const sends = [...((data.sends as SendLog[] | null) ?? []), { ...entry, at: new Date().toISOString() }];
    await db.from('estimator_quotes').update({ sends }).eq('id', data.id);
  } catch (e) {
    console.error('Estimator quote: could not log a send', e);
  }
}

async function fetchMap(path: string | null, origin: string): Promise<Uint8Array | null> {
  if (!path) return null;
  try {
    const r = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok || !/^image\/(png|jpe?g)/.test(r.headers.get('content-type') || '')) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export type DeliverArgs = {
  reference: string;
  enquiryId: string;
  name: string;
  email: string;
  /** 447… when it is a valid UK mobile. */
  mobile: string | null;
  delivery: Delivery;
  facts: QuoteFacts;
  mapPath: string | null;
  origin: string;
  /** What the visitor agreed to beyond the quote: sets the WhatsApp marketing permission only (the quote itself needs no tick box). */
  whatsappMarketing: boolean;
};

/**
 * Makes the PDF, stores it under a path nobody can guess, and sends it: by email (from the Heliaxis mailbox, logged on the enquiry) and by
 * WhatsApp (an approved template with the PDF as its header), as they asked. Then tells the team, with the PDF link. Every send is logged
 * on the quote. Never throws: a failed send never loses the lead.
 */
export async function deliverQuote(a: DeliverArgs): Promise<{ pdfPath: string | null }> {
  const db = createAdminClient();
  let bytes: Uint8Array | null = null;
  let pdfPath: string | null = null;
  try {
    bytes = await makeEstimatePdf(a.facts, { mapBytes: await fetchMap(a.mapPath, a.origin) });
    await ensureDocsBucket();
    pdfPath = `estimator/${a.reference}-${randomBytes(12).toString('hex')}.pdf`;
    const up = await db.storage.from(DOCS_BUCKET).upload(pdfPath, bytes, { contentType: 'application/pdf', upsert: false });
    if (up.error) {
      console.error('Estimator quote: could not store the PDF', up.error.message);
      pdfPath = null;
    } else {
      await db.from('estimator_quotes').update({ pdf_path: pdfPath }).eq('reference', a.reference).then(() => null, () => null);
    }
  } catch (e) {
    console.error('Estimator quote: could not make the PDF', e);
    await logSend(a.reference, { channel: 'email', ok: false, error: `PDF failed: ${e instanceof Error ? e.message : 'error'}` });
  }

  // Email: the quote they asked for.
  if (a.delivery !== 'whatsapp' && bytes) {
    try {
      if (!msConfigured()) throw new Error('Microsoft 365 is not connected');
      const mail = quoteEmail(a.facts, { unsubscribeUrl: unsubscribeUrl(a.reference), name: a.name });
      const graphId = await sendMail({ to: a.email, subject: mail.subject, text: mail.text, html: mail.html, attachments: [{ name: `Heliaxis solar estimate ${a.reference}.pdf`, contentType: 'application/pdf', bytes }] });
      await db.from('crm_emails').insert({ enquiry_id: a.enquiryId, graph_id: graphId, direction: 'out', subject: mail.subject, body: `${mail.text.slice(0, 3900)}\n[PDF attached: ${a.reference}]`, from_address: process.env.MS_MAILBOX, to_address: a.email, attachments: [`Heliaxis solar estimate ${a.reference}.pdf`], at: new Date().toISOString() }).then(() => null, () => null);
      await logSend(a.reference, { channel: 'email', ok: true, id: graphId });
    } catch (e) {
      console.error('Estimator quote: email failed', e);
      await logSend(a.reference, { channel: 'email', ok: false, error: e instanceof Error ? e.message : 'failed' });
    }
  }

  // WhatsApp: only when they chose it and gave a valid mobile.
  if (a.delivery !== 'email' && a.mobile) {
    const link = pdfPath ? await signedDoc(pdfPath, 3600, `Heliaxis solar estimate ${a.reference}.pdf`) : null;
    const r = await sendQuoteOnWhatsApp({ enquiryId: a.enquiryId, to: a.mobile, name: a.name, reference: a.reference, pdfUrl: link });
    await logSend(a.reference, { channel: 'whatsapp', ok: r.ok, id: r.id ?? null, error: r.error ?? null, note: r.note });
  }

  await teamAlert(a, pdfPath);
  return { pdfPath };
}

/** The team's alert email: who, what they were quoted and the PDF link (good for a week). */
async function teamAlert(a: DeliverArgs, pdfPath: string | null) {
  try {
    if (!msConfigured()) return;
    const link = pdfPath ? await signedDoc(pdfPath, 7 * 86400) : null;
    const f = a.facts;
    const html = emailShell(
      'Estimate sent',
      stackedRows(
        [
          ['Name', a.name],
          ['Email', a.email],
          ['Mobile', a.mobile ? `+${a.mobile}` : 'Not given'],
          ['Sent by', a.delivery === 'both' ? 'Email and WhatsApp' : a.delivery === 'email' ? 'Email' : 'WhatsApp'],
          ['Reference', a.reference],
          ['Property', [f.address, f.postcode].filter(Boolean).join(', ') || 'Not given'],
          ['Estimate', `£${f.priceLow.toLocaleString('en-GB')} – £${f.priceHigh.toLocaleString('en-GB')} ${f.vatLabel}`],
          ['System', `${f.panels} panels · ${f.kwp.toFixed(2)} kWp${f.inverter ? ` · ${f.inverter}` : ''}${f.batteryName ? ` · ${f.batteryName}` : ''}`],
          ...(link ? ([['PDF', 'Open the quote PDF (link works for 7 days)']] as [string, string][]) : []),
        ],
        { Email: `mailto:${a.email}`, ...(link ? { PDF: link } : {}) },
      ),
      { href: `${SITE_URL()}/admin/enquiries?enquiry=${a.enquiryId}`, label: 'Open the enquiry' },
      'Solar estimator',
      'heliaxis.co.uk · Someone asked for their full quote.',
    );
    await sendMail({ to: process.env.ADMIN_EMAIL || 'hello@heliaxis.co.uk', subject: `Estimate sent: ${a.name} (${a.reference})`, text: `${a.name} asked for their full quote (${a.reference}). Open the enquiry: ${SITE_URL()}/admin/enquiries?enquiry=${a.enquiryId}${link ? `
PDF: ${link}` : ''}`, html, replyTo: a.email });
    await logSend(a.reference, { channel: 'team-email', ok: true });
  } catch (e) {
    console.error('Estimator quote: team alert failed', e);
  }
}
