import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, ensurePortalToken, isUuid, json, portalUrl } from '@/lib/crm/server';
import { fillText } from '@/lib/crm/settings-shared';
import { PORTAL_CLOSED_MSG } from '@/lib/crm/stages';
import { msConfigured, sendMail, type MailAttachment } from '@/lib/ms365';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_ATTACH = 3 * 1024 * 1024; // Microsoft's simple-send limit; bigger files go as a portal link

/** Send an email to the customer from the shared Microsoft 365 mailbox, with attachments. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!msConfigured()) return json({ error: 'Microsoft 365 isn’t connected yet.', notConnected: true }, 400);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const { data: c } = await db.from('enquiries').select('id, name, email').eq('id', p.enquiry_id).maybeSingle();
  if (!c?.email) return json({ error: 'This customer has no email address.' }, 400);

  const token = String(b.text || '').includes('{portal_link}') ? await ensurePortalToken(id) : null;
  if (String(b.text || '').includes('{portal_link}') && !token) return json({ error: `This email uses {portal_link}. ${PORTAL_CLOSED_MSG}` }, 400);
  const link = token ? portalUrl(token) : null;
  const subject = fillText(String(b.subject || '').trim(), { name: c.name, portalLink: link }) || 'Your Heliaxis project';
  let text = fillText(String(b.text || '').trim(), { name: c.name, portalLink: link });
  if (!text) return json({ error: 'Write the email first.' }, 400);

  // Attachments from this opportunity's documents and the company library.
  const docIds = (Array.isArray(b.documentIds) ? b.documentIds : []).filter((x: unknown) => isUuid(String(x)));
  const libIds = (Array.isArray(b.libraryIds) ? b.libraryIds : []).filter((x: unknown) => isUuid(String(x)));
  const [{ data: docs }, { data: libs }] = await Promise.all([
    docIds.length ? db.from('crm_documents').select('name, storage_path, mime, size').in('id', docIds).eq('project_id', id) : Promise.resolve({ data: [] }),
    libIds.length ? db.from('crm_library').select('name, storage_path, mime, size').in('id', libIds) : Promise.resolve({ data: [] }),
  ]);
  const files = [...(docs ?? []), ...(libs ?? [])] as { name: string; storage_path: string; mime: string | null; size: number | null }[];
  const attachments: MailAttachment[] = [];
  let total = 0;
  const tooBig: string[] = [];
  for (const f of files) {
    if ((f.size ?? 0) + total > MAX_ATTACH) {
      tooBig.push(f.name);
      continue;
    }
    const { data: blob } = await db.storage.from(DOCS_BUCKET).download(f.storage_path);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    total += bytes.length;
    const ext = f.storage_path.split('.').pop() || '';
    attachments.push({ name: f.name.includes('.') ? f.name : `${f.name}.${ext}`, contentType: f.mime || 'application/octet-stream', bytes });
  }
  if (tooBig.length) {
    const portalToken = await ensurePortalToken(id);
    if (!portalToken)
      return json({ error: `${tooBig.join(', ')} is too big to attach (over 3 MB), and there's no customer portal to link to until the job starts.` }, 400);
    const portal = portalUrl(portalToken);
    text += `\n\nYou can download ${tooBig.join(', ')} from your Heliaxis portal: ${portal}`;
  }

  let graphId: string;
  try {
    graphId = await sendMail({ to: c.email, subject, text, attachments });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Email not sent' }, 502);
  }
  const now = new Date().toISOString();
  await db.from('crm_emails').insert({
    enquiry_id: c.id,
    project_id: id,
    graph_id: graphId,
    direction: 'out',
    subject,
    body: text.slice(0, 4000),
    from_address: process.env.MS_MAILBOX,
    to_address: c.email,
    sent_by: s.user.id,
    attachments: files.map((f) => f.name),
    at: now,
  });
  await db.from('crm_projects').update({ updated_at: now }).eq('id', id);
  await db.from('crm_projects').update({ first_contact_at: now }).eq('id', id).is('first_contact_at', null);
  return json({ ok: true });
}
