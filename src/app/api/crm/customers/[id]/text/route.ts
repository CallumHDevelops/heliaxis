import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms';
import { markFirstContact } from '@/lib/whatsapp/inbox';

export const dynamic = 'force-dynamic';

/**
 * A text message (SMS) from a person to a customer with a UK mobile: for when WhatsApp isn't agreed or isn't there. It is saved in their
 * chat as "Text message: …" (so the whole conversation is in one place) and counts as first contact. { text } → { ok }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const text = String(b.text || '').replace(/\r/g, '').trim().slice(0, 600);
  if (text.length < 2) return json({ error: 'Write the message first.' }, 400);
  if (!smsConfigured()) return json({ error: 'Text messages aren’t set up yet (the SMSWORKS keys in Vercel).' }, 400);
  const db = createAdminClient();
  const { data: e } = await db.from('enquiries').select('id, name, phone, wa_id').eq('id', id).maybeSingle();
  if (!e) return json({ error: 'Customer not found' }, 404);
  const to = (e.phone as string | null) || (e.wa_id as string | null);
  if (!toMsisdn(to)) return json({ error: 'That isn’t a UK mobile number, so it can’t be texted. Ring them or email instead.' }, 400);
  const r = await sendSms(to as string, text, 'crm-manual');
  if (!r.ok) return json({ error: r.error }, 502);
  const now = new Date().toISOString();
  await db.from('whatsapp_messages').insert({
    enquiry_id: e.id,
    wa_message_id: `sms:${randomUUID()}`,
    direction: 'out',
    kind: 'text',
    body: `Text message: ${text}`,
    status: 'sent',
    sent_by: s.user.id,
    via: 'sms',
    created_at: now,
  });
  await markFirstContact(db, e.id as string, now).catch(() => null);
  return json({ ok: true });
}
