import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  crmSession,
  docCategoryOf,
  DOC_MIME,
  DOCS_BUCKET,
  ensureDocsBucket,
  fingerprintDocument,
  isUuid,
  json,
  logActivity,
  MAX_DOC_BYTES,
  safeName,
} from '@/lib/crm/server';
import { SIGNABLE_CATEGORIES } from '@/lib/crm/portal';
import { readMcsNumber } from '@/lib/handover/read';
import { handoverReady, patchSlotData, refreshHandover, tellCustomer, type Via } from '@/lib/handover/server';
import { isSlot, slotDef } from '@/lib/handover/slots';
import { buildPdf } from '@/lib/subcontractors/pdf-engine';

export const dynamic = 'force-dynamic';

const IMAGE = /^image\/(jpeg|png|webp|heic|heif)$/i;
const PARTS = ['application', 'acceptance', 'installation', 'g100'];

/**
 * Opportunity paperwork. { action: 'prepare', name, mime, size } → a one-time upload URL (files go
 * straight to storage); { action: 'save', path, name, category, visible, needs_signature } → record it
 * (needs_signature only on quotes and contracts).
 *
 * Straight into the customer's handover pack (owner's ask [8], SPEC 4.4), once handover.sql has run:
 * save also takes handover_slot (the item: HX-HO-03, HX-HO-19…), hold (keep it until the pack is sent; shown
 * in their portal at once otherwise), replace (the document it replaces, archived), part (HX-HO-16's
 * paper) and tell ['whatsapp' | 'email'] ("We've added your MCS certificate"). A photo becomes an A4
 * PDF page. An MCS certificate is read for its number, offered back to save.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!p) return json({ error: 'Not found' }, 404);

  if (b.action === 'prepare') {
    const mime = String(b.mime || '');
    if (!DOC_MIME.includes(mime)) return json({ error: 'Upload a PDF, photo, Word or Excel file.' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_DOC_BYTES) return json({ error: 'Files must be under 25 MB.' }, 400);
    await ensureDocsBucket();
    const path = `projects/${id}/${Date.now()}-${safeName(String(b.name || 'document'))}`;
    const { data, error } = await db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
    return json({ bucket: DOCS_BUCKET, path, token: data.token });
  }

  if (b.action === 'save') {
    let path = String(b.path || '');
    if (!path.startsWith(`projects/${id}/`) || path.includes('..')) return json({ error: 'Bad file' }, 400);
    const slot = isSlot(b.handover_slot) && b.handover_slot !== 'PACK' && (await handoverReady()) ? String(b.handover_slot) : null;
    const category = await docCategoryOf(b.category ?? (slot ? slotDef(slot)?.category : undefined));
    const name = String(b.name || '').trim().slice(0, 140) || (slot ? (slotDef(slot)?.title ?? 'Document') : 'Document');
    let mime = String(b.mime || '') || null;
    let size = Number(b.size) || null;
    // Into the pack: a photo (of a certificate, say) becomes an A4 PDF page, so it merges and prints.
    if (slot && mime && IMAGE.test(mime)) {
      const { data: blob } = await db.storage.from(DOCS_BUCKET).download(path);
      const out = blob ? await buildPdf([{ bytes: new Uint8Array(await blob.arrayBuffer()), mime, name }]).catch(() => null) : null;
      if (out) {
        const pdfPath = `${path.replace(/\.[a-z0-9]+$/i, '')}.pdf`;
        const up = await db.storage.from(DOCS_BUCKET).upload(pdfPath, out.bytes, { contentType: 'application/pdf', upsert: true });
        if (!up.error) {
          await db.storage.from(DOCS_BUCKET).remove([path]);
          path = pdfPath;
          mime = 'application/pdf';
          size = out.bytes.length;
        }
      }
    }
    const hold = slot ? b.hold === true : false;
    const { data: doc, error } = await db
      .from('crm_documents')
      .insert({
        project_id: id,
        category,
        name,
        storage_path: path,
        mime,
        size,
        visible: slot ? !hold : b.visible !== false,
        needs_signature: !!b.needs_signature && SIGNABLE_CATEGORIES.includes(category),
        uploaded_by: s.user.id,
        ...(slot ? { handover_slot: slot, release: hold ? 'with_pack' : 'now', source: 'upload' } : {}),
      })
      .select('*')
      .single();
    if (error) return json({ error: error.message }, 500);
    let read: { mcs_cert_no: string } | null = null;
    if (slot) {
      // Replacing: the old one is archived (kept, never shown to the customer).
      if (isUuid(String(b.replace ?? ''))) {
        await db.from('crm_documents').update({ archived_at: new Date().toISOString(), archived_by: s.user.id, visible: false }).eq('id', String(b.replace)).eq('project_id', id).eq('handover_slot', slot);
      }
      if (slot === 'HX-HO-16' && PARTS.includes(String(b.part))) await patchSlotData(db, id, 'HX-HO-16', { parts: { [doc.id]: String(b.part) } }, s.user.id);
      if (slot === 'HX-HO-03' && mime && (mime === 'application/pdf' || IMAGE.test(mime))) {
        const { data: file } = await db.storage.from(DOCS_BUCKET).download(path);
        const n = file ? await readMcsNumber(new Uint8Array(await file.arrayBuffer()), mime) : null;
        if (n) read = { mcs_cert_no: n };
      }
      const tell = (Array.isArray(b.tell) ? b.tell : []).filter((x: unknown): x is Via => x === 'whatsapp' || x === 'email');
      const by = s.user.id;
      // The pack catches up after the reply: made, released and, once it's been sent, rebuilt.
      after(async () => {
        await refreshHandover(db, id, { by }).catch((e) => console.error('[handover] after upload', e));
        if (tell.length && !hold) await tellCustomer(db, id, slot, tell, by).catch(() => null);
      });
    }
    // A fingerprint of the file, so a signed quote can be matched to exactly what they signed.
    after(() => fingerprintDocument(doc.id as string));
    await logActivity({
      enquiryId: p.enquiry_id,
      projectId: id,
      kind: 'system',
      body: `Document added: ${name}${slot ? ` (handover pack: ${slotDef(slot)?.title})` : ''}${doc.visible ? ' (in their portal)' : ''}`,
      byId: s.user.id,
    });
    return json({ document: doc, read });
  }
  return json({ error: 'Unknown action' }, 400);
}
