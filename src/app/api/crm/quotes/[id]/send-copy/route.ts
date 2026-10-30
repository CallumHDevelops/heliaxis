import { crmSession, isUuid, json, portalUrl, siteUrl } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { msConfigured, sendMail } from '@/lib/ms365';
import { docFileName } from '@/lib/documents/pdf-kit';
import { quoteEmailHtml } from '@/lib/quotes/email';
import { defaultQuoteMessage, firstOf, quoteSms, quoteSubject } from '@/lib/quotes/message';
import { customerRefOf, readQuote, renderQuote } from '@/lib/quotes/server';
import { totalsOf } from '@/lib/quotes/types';
import { sendSms, smsConfigured } from '@/lib/sms';
import { readStaffMobile, saveStaffMobile } from '@/lib/staff-mobile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Channel = { ok: true; to: string } | { ok: false; error: string };

/**
 * "Send me a copy": what the customer will get, sent to the person pressing it, by email (the branded email with the quote PDF
 * attached) and by text. Nothing goes to the customer and the job does not move. The link is the customer's own once the quote has
 * been sent; before that it is the PDF preview (you must be signed in to open it). { message?, mobile? }: a mobile is asked for once and kept.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const q = await readQuote(id);
  if (!q) return json({ error: 'Not found' }, 404);
  if (totalsOf(q.content).gross <= 0) return json({ error: 'Add at least one priced item first.' }, 400);
  const b = (await req.json().catch(() => ({}))) as { message?: string; mobile?: string };

  const db = createAdminClient();
  const [{ data: c }, { data: proj }, ref] = await Promise.all([
    db.from('enquiries').select('name').eq('id', q.enquiry_id).maybeSingle(),
    db.from('crm_projects').select('portal_token').eq('id', q.project_id).maybeSingle(),
    customerRefOf(q.enquiry_id),
  ]);
  const name = (c?.name as string) || '';
  const live = q.status !== 'draft' && !!proj?.portal_token;
  const url = live ? portalUrl(String(proj!.portal_token)) : `${siteUrl()}/api/crm/quotes/${id}/pdf`;
  const message = String(b.message || '').trim().slice(0, 3000) || defaultQuoteMessage(name, q.title);

  const out: { email: Channel; sms: Channel; needMobile?: boolean; live: boolean } = { email: { ok: false, error: '' }, sms: { ok: false, error: '' }, live };

  // Email: to the person pressing the button.
  const to = String(s.profile.email || s.user.email || '').trim();
  if (!to) out.email = { ok: false, error: 'There is no email address on your account.' };
  else if (!msConfigured()) out.email = { ok: false, error: 'Microsoft 365 isn’t connected, so email can’t be sent.' };
  else {
    try {
      const bytes = await renderQuote(q);
      const note = '<p style="margin:0 0 16px;padding:10px 12px;background:#FFF6DC;border-left:3px solid #F8BC1E;font-size:13px">This is a copy for you, so you can see what the customer receives. Nothing has been sent to them.</p>';
      const html = quoteEmailHtml(message, url, note);
      await sendMail({ to, subject: `Copy: ${quoteSubject}`, text: `This is a copy for you. Nothing has been sent to the customer.\n\n${message}\n\nView your quote: ${url}`, html, attachments: [{ name: docFileName(ref, 'Quote', q.number), contentType: 'application/pdf', bytes }] });
      out.email = { ok: true, to };
    } catch (e) {
      out.email = { ok: false, error: e instanceof Error ? e.message : 'Email not sent' };
    }
  }

  // Text: to your mobile, asked for once.
  let mobile = await readStaffMobile(s.user.id);
  if (b.mobile) mobile = (await saveStaffMobile(s.user.id, b.mobile)) ?? mobile;
  if (!mobile) {
    out.needMobile = true;
    out.sms = { ok: false, error: b.mobile ? 'That doesn’t look like a UK mobile number.' : 'Add your mobile number to get the text.' };
  } else if (!smsConfigured()) out.sms = { ok: false, error: 'Text messages aren’t set up yet.' };
  else {
    const r = await sendSms(mobile, `COPY: ${quoteSms(firstOf(name), url)}`, 'quote-copy');
    out.sms = r.ok ? { ok: true, to: mobile } : { ok: false, error: r.error };
  }
  return json(out);
}
