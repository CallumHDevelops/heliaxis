import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, signedDoc } from '@/lib/crm/server';
import { sendWhatsAppDocument } from '@/lib/whatsapp/inbox';

export const dynamic = 'force-dynamic';

/** Send one of the opportunity's documents, or a library document, to the customer on WhatsApp. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const docId = String(b.id || '');
  if (!isUuid(docId)) return json({ error: 'Pick a document' }, 400);
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('enquiry_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);
  const { data: doc } =
    b.source === 'library'
      ? await db.from('crm_library').select('name, storage_path').eq('id', docId).maybeSingle()
      : await db.from('crm_documents').select('name, storage_path').eq('id', docId).eq('project_id', id).maybeSingle();
  if (!doc) return json({ error: 'Document not found' }, 404);
  const link = await signedDoc(doc.storage_path, 600);
  if (!link) return json({ error: 'File missing' }, 404);
  const ext = doc.storage_path.split('.').pop() || 'pdf';
  const filename = doc.name.includes('.') ? doc.name : `${doc.name}.${ext}`;
  const r = await sendWhatsAppDocument(p.enquiry_id, s.user.id, link, filename, String(b.caption || '').trim() || undefined);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
}
