import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';

/**
 * A WhatsApp message a person sent that WhatsApp could not deliver because the number isn't on WhatsApp ("Message Undeliverable", error
 * 131026; or the person hasn't accepted WhatsApp's terms): send the same words as a text instead, once, and say so in the chat and to the
 * person who sent it. Only a UK mobile can be texted (a landline can't take either), so then they are told to ring instead.
 * Never throws: the WhatsApp status is already recorded and a failed text must not break the webhook.
 */

/** Is this failure the "number can't receive WhatsApp" kind (not a closed window, a paused template, a rate limit...)? */
export function isUndeliverable(e: { code?: number; title?: string; message?: string; error_data?: { details?: string } } | undefined): boolean {
  if (!e) return false;
  if (e.code === 131026) return true;
  return /undeliverable|not a valid whatsapp user|not.*on whatsapp|accept(ed)?.*terms/i.test([e.title, e.message, e.error_data?.details].filter(Boolean).join(' '));
}

/** The words of a sent WhatsApp as a text: a template's button labels ("[Call me today] [Message me instead]") become "reply or call us". */
export function textOf(body: string): string {
  const lines = body.replace(/\s+$/, '').split('\n');
  let hadButtons = false;
  while (lines.length && /^\s*(\[[^\]]{1,40}\]\s*)+$/.test(lines[lines.length - 1])) {
    lines.pop();
    hadButtons = true;
  }
  const words = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const tail = hadButtons ? ` Reply to this text or call us on ${HELIAXIS_COMPANY.phone}.` : '';
  return `${words}${tail}`.slice(0, 900);
}

type Msg = { id: string; enquiry_id: string; body: string | null; kind: string | null; sent_by: string | null; direction: string | null };

export async function textInsteadOfUndeliverable(msg: Msg, reason: string): Promise<'texted' | 'not-sent' | 'skipped'> {
  try {
    // Only what a person sent: automatic messages are not turned into texts behind anyone's back.
    if (msg.direction !== 'out' || !msg.sent_by || !msg.body || !['text', 'template'].includes(String(msg.kind))) return 'skipped';
    const db = createAdminClient();
    const { data: e } = await db.from('enquiries').select('id, name, phone, wa_id').eq('id', msg.enquiry_id).maybeSingle();
    if (!e) return 'skipped';
    const first = String(e.name || '').trim().split(/\s+/)[0] || 'the customer';
    const href = `/admin/enquiries/inbox?c=${e.id}`;
    const tell = (title: string, body: string) => notify({ userId: msg.sent_by as string, kind: 'whatsapp', title, body, href, tag: `wa-sms-${msg.id}` }).catch(() => null);
    const phone = (e.phone as string | null) || (e.wa_id as string | null);
    if (!smsConfigured()) {
      await tell(`WhatsApp to ${first} didn’t go`, `${reason}. Text messages aren’t set up, so ring them instead.`);
      return 'not-sent';
    }
    if (!toMsisdn(phone)) {
      await tell(`WhatsApp to ${first} didn’t go`, `${reason}. Their number looks like a landline, which can’t get WhatsApp or texts. Give them a ring.`);
      return 'not-sent';
    }
    // Once only: the fallback's own row has a unique id made from the failed message's.
    const text = textOf(msg.body);
    const claim = await db.from('whatsapp_messages').insert({
      enquiry_id: e.id,
      wa_message_id: `sms:${msg.id}`,
      direction: 'out',
      kind: 'text',
      body: `Text message instead of WhatsApp: ${text}`,
      status: 'sent',
      sent_by: msg.sent_by,
      via: 'sms-fallback',
    });
    if (claim.error) return 'skipped';
    const r = await sendSms(phone as string, text, 'wa-fallback');
    if (!r.ok) {
      await db.from('whatsapp_messages').update({ status: 'failed', error: r.error }).eq('wa_message_id', `sms:${msg.id}`);
      await tell(`WhatsApp to ${first} didn’t go`, `${reason}, and the text didn’t go either: ${r.error}. Give them a ring.`);
      return 'not-sent';
    }
    await tell(`Texted ${first} instead`, `${reason}, so your message went as a text to ${phone}.`);
    return 'texted';
  } catch {
    return 'skipped';
  }
}
