import { createAdminClient } from '@/lib/supabase/admin';
import { markContacted } from '@/lib/crm/server';
import { emailBodyFromWhatsApp, emailFooter } from '@/lib/whatsapp/email-fallback';
import { msConfigured, sendMail } from '@/lib/ms365';
import { chatSession, json, mayOpenChat } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/**
 * Email the customer from the shared mailbox (hello@) when WhatsApp can't reach them. It is logged on their
 * account like any other email, and their replies come back through the mailbox poll (pollMailbox in
 * src/lib/ms365.ts) onto the same account.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const s = await chatSession(id);
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await mayOpenChat(s, id))) return json({ error: 'Not found' }, 404);
  if (!msConfigured()) return json({ error: 'Microsoft 365 isn’t connected yet, so email can’t be sent.' }, 400);

  const b = await req.json().catch(() => ({}));
  const subject = String(b.subject || '').trim().slice(0, 200);
  const text = emailBodyFromWhatsApp(String(b.text || ''));
  if (!subject) return json({ error: 'Add a subject.' }, 400);
  if (!text) return json({ error: 'Write the email first.' }, 400);

  const db = createAdminClient();
  const { data: c } = await db.from('enquiries').select('id, name, email').eq('id', id).maybeSingle();
  if (!c) return json({ error: 'Not found' }, 404);
  const to = (c.email || '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'This customer has no email address on file. Add one on their record first.' }, 400);

  const mailbox = process.env.MS_MAILBOX || '';
  const full = `${text}\n\n${emailFooter(mailbox)}`;
  let graphId: string;
  try {
    graphId = await sendMail({ to, subject, text: full });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Email not sent' }, 502);
  }

  const { data: proj } = await db.from('crm_projects').select('id, stage').eq('enquiry_id', id).order('created_at', { ascending: false }).limit(20);
  const job = (proj ?? []).find((p) => p.stage !== 'complete' && p.stage !== 'lost') ?? proj?.[0];
  const now = new Date().toISOString();
  await db.from('crm_emails').insert({
    enquiry_id: id,
    project_id: job?.id ?? null,
    graph_id: graphId,
    direction: 'out',
    subject,
    body: full.slice(0, 4000),
    from_address: mailbox,
    to_address: to,
    sent_by: s.user.id,
    attachments: [],
    at: now,
  });
  await markContacted({ enquiryId: id }, now);
  return json({ ok: true, to });
}
