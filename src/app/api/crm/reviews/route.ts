import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { firstNameOf, messageFor, newReviewToken, readReviewSettings, reviewLink, sendReviewEmail, siteUrl } from '@/lib/reviews/server';

export const dynamic = 'force-dynamic';

/** Review requests, newest first, each with the customer's name. ?enquiry= narrows it to one customer. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const q = new URL(req.url).searchParams.get('enquiry') ?? '';
  const db = createAdminClient();
  let query = db.from('review_requests').select('*').order('sent_at', { ascending: false }).limit(300);
  if (isUuid(q)) query = query.eq('enquiry_id', q);
  const { data, error } = await query;
  if (error) return json({ error: error.message, missing: /review_requests/.test(error.message) }, 500);
  const rows = (data ?? []) as { enquiry_id: string }[];
  const ids = [...new Set(rows.map((r) => r.enquiry_id))];
  const { data: names } = ids.length ? await db.from('enquiries').select('id, name').in('id', ids) : { data: [] };
  const byId = new Map(((names ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]));
  return json({ requests: rows.map((r) => ({ ...r, customer: byId.get(r.enquiry_id) ?? '' })) });
}

/**
 * Ask a customer for a review: { enquiry_id, project_id?, channel: 'email' | 'sms' | 'whatsapp' | 'link' }. Email and text are sent from here;
 * WhatsApp and link give back the wording and the link for the person to send themselves. The same link and the same page for everyone.
 */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = (await req.json().catch(() => ({}))) as { enquiry_id?: string; project_id?: string; channel?: string };
  if (!isUuid(String(b.enquiry_id ?? ''))) return json({ error: 'Choose a customer.' }, 400);
  const channel = (['email', 'sms', 'whatsapp', 'link'] as const).find((c) => c === b.channel) ?? 'link';
  const db = createAdminClient();
  const settings = await readReviewSettings(db);
  if (!settings.googleUrl && !settings.trustpilotUrl) return json({ error: 'Add your Google or Trustpilot review link first (CRM › Reviews).', setup: true }, 400);
  const { data: e } = await db.from('enquiries').select('id, name, email, phone, wa_id').eq('id', b.enquiry_id!).maybeSingle();
  if (!e) return json({ error: 'Customer not found' }, 404);
  const first = firstNameOf(String(e.name ?? ''));
  const token = newReviewToken();
  const link = reviewLink(siteUrl(), token);
  const text = messageFor(settings, first, link).sms;

  if (channel === 'email' && !String(e.email ?? '').includes('@')) return json({ error: 'They have no email address on file.' }, 400);
  const to = (e.phone as string | null) || (e.wa_id as string | null);
  if (channel === 'sms') {
    if (!smsConfigured()) return json({ error: 'Text messages aren’t set up yet (the SMSWORKS keys in Vercel).' }, 400);
    if (!toMsisdn(to)) return json({ error: 'That isn’t a UK mobile number, so it can’t be texted.' }, 400);
  }
  const project = isUuid(String(b.project_id ?? '')) ? String(b.project_id) : null;
  const { data: row, error } = await db.from('review_requests').insert({ token, enquiry_id: e.id, project_id: project, channel, sent_by: s.user.id }).select('id').single();
  if (error || !row) return json({ error: error?.message || 'Couldn’t make the request.', missing: /review_requests/.test(error?.message ?? '') }, 500);

  try {
    if (channel === 'email') await sendReviewEmail(String(e.email), first, link, settings);
    if (channel === 'sms') {
      const r = await sendSms(to as string, text, 'review-request');
      if (!r.ok) throw new Error(r.error);
      await db.from('whatsapp_messages').insert({ enquiry_id: e.id, wa_message_id: `sms:${randomUUID()}`, direction: 'out', kind: 'text', body: `Text message: ${text}`, status: 'sent', sent_by: s.user.id, via: 'sms', created_at: new Date().toISOString() });
    }
  } catch (err) {
    await db.from('review_requests').delete().eq('id', row.id);
    return json({ error: `It didn’t send: ${err instanceof Error ? err.message : 'try again'}.` }, 502);
  }
  await logActivity({ enquiryId: e.id as string, projectId: project, kind: 'system', body: `Review request ${channel === 'link' ? 'link made' : channel === 'whatsapp' ? 'prepared for WhatsApp' : `sent by ${channel === 'sms' ? 'text' : 'email'}`}`, byId: s.user.id }).catch(() => null);
  return json({ ok: true, id: row.id, link, text, sent: channel === 'email' || channel === 'sms' });
}
