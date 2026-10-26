import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, ensurePortalToken, isUuid, json, logActivity, portalUrl } from '@/lib/crm/server';
import { emailShell, esc } from '@/lib/subcontractors/server';
import { msConfigured, sendMail } from '@/lib/ms365';
import { listPortalMessages, MAX_MESSAGE } from '@/lib/portal-messages';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** The portal conversation on this job. Opening it marks the customer's messages as read. */
export async function GET(_: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const messages = await listPortalMessages(id);
  await createAdminClient().from('portal_messages').update({ read_at: new Date().toISOString() }).eq('project_id', id).eq('direction', 'in').is('read_at', null).then(() => null, () => null);
  return json({ messages });
}

/**
 * Reply to the customer in their portal: { body }. It is logged on their record, and they are emailed a
 * short note with their link (when email is connected and they have an address) so they know to look.
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const text = String(b.body || '').trim().slice(0, MAX_MESSAGE);
  if (!text) return json({ error: 'Write your reply first.' }, 400);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, title').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const { error } = await db.from('portal_messages').insert({ project_id: id, enquiry_id: p.enquiry_id, direction: 'out', body: text, sent_by: s.user.id });
  if (error) return json({ error: error.message }, 500);
  await logActivity({ enquiryId: p.enquiry_id, projectId: id, kind: 'note', body: `💬 Reply sent in the customer’s portal: ${text.length > 400 ? `${text.slice(0, 400)}…` : text}`, byId: s.user.id });

  let emailed: string | null = null;
  const { data: c } = await db.from('enquiries').select('name, email').eq('id', p.enquiry_id).maybeSingle();
  const token = await ensurePortalToken(id);
  if (msConfigured() && c?.email && token) {
    const first = String(c.name || '').split(/\s+/)[0] || 'there';
    try {
      const html = emailShell(
        `You have a new message from Heliaxis`,
        `<p>Dear ${esc(first)},</p><p>We have replied to your message. Open your portal to read it and reply.</p>`,
        { href: portalUrl(token), label: 'Read our reply' },
        'Your project'
      );
      await sendMail({ to: c.email as string, subject: 'You have a new message from Heliaxis', text: `Dear ${first},\n\nWe have replied to your message. Read it here: ${portalUrl(token)}`, html });
      emailed = c.email as string;
    } catch {
      // The reply is saved either way.
    }
  }
  return json({ ok: true, emailed });
}
