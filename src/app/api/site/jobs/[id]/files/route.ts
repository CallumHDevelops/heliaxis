import { after } from 'next/server';
import { DOCS_BUCKET, ensureDocsBucket, fingerprintDocument } from '@/lib/crm/server';
import { deviceSession, isResponse, siteJson, theirAssignment } from '@/lib/site/device';
import { tradeFilePath } from '@/lib/site/electrician';
import { afterAnswers, lateKeysFor } from '@/lib/site/hooks';
import { logSiteEvent, readAssignment } from '@/lib/site/server';

export const dynamic = 'force-dynamic';

const SLOT = /^[A-Za-z][A-Za-z0-9_]{0,30}$/;
const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const MAX_BYTES = 15 * 1024 * 1024;
const MIME = ['application/pdf'];
/** The slots a file can go in, and the handover item it is (D3): the certificate from their own scheme goes in HX-HO-04. */
const SLOTS: Record<string, { category: string; handover: string | null; title: string }> = {
  CERT_FILE: { category: 'certificate', handover: 'HX-HO-04', title: 'Electrical certificate' },
};

/**
 * A trade's own documents (their certificate from NAPIT or NICEIC software), straight from the phone
 * to storage, like photos:
 * - { action: 'prepare', client_id, slot, name, mime, size }: a signed upload link.
 * - { action: 'save', client_id, slot, name, mime, size }: the job document row (held back from the
 *   customer until the handover pack goes, D24), once however often it's retried.
 * - { action: 'delete', client_id }: before sign-off only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await deviceSession(req);
  if (isResponse(s)) return s;
  const a = await theirAssignment(s, (await params).id);
  if (isResponse(a)) return a;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = b.client_id;
  if (!isUuid(clientId)) return siteJson({ error: 'bad', message: 'That file can’t be sent.' }, 400);
  const signed = a.status === 'signed' || a.status === 'done';
  const late = signed ? new Set(await lateKeysFor(s.db, a)) : null;
  const slot = String(b.slot ?? '');
  const name = String(b.name ?? '').trim().slice(0, 120) || 'certificate.pdf';
  const mime = String(b.mime ?? '');

  if (b.action === 'prepare' || b.action === 'save') {
    if (!SLOT.test(slot) || !SLOTS[slot] || !MIME.includes(mime)) return siteJson({ error: 'bad', message: 'That file can’t be sent. A PDF only.' }, 400);
    if (!(Number(b.size) > 0) || Number(b.size) > MAX_BYTES) return siteJson({ error: 'too_big', message: 'That file is over 15 MB. Take a photo of each page instead.' }, 400);
    if (late && !late.has(slot)) return siteJson({ error: 'signed', message: 'This form is signed off. Ask the office to reopen it.' }, 409);
    const path = tradeFilePath(a.project_id, a.id, slot, clientId, name);
    if (b.action === 'prepare') {
      await ensureDocsBucket();
      const up = await s.db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (up.error || !up.data) return siteJson({ error: 'busy', message: 'Couldn’t get ready to send. It will try again.' }, 503);
      return siteJson({ path, url: up.data.signedUrl });
    }
    const kind = SLOTS[slot];
    const { data: have } = await s.db.from('crm_documents').select('id').eq('storage_path', path).maybeSingle();
    if (!have) {
      const { data: ref } = await s.db.from('crm_projects').select('project_ref').eq('id', a.project_id).maybeSingle();
      const { error } = await s.db.from('crm_documents').insert({
        project_id: a.project_id,
        category: kind.category,
        name: `${[(ref as { project_ref?: string } | null)?.project_ref, kind.title].filter(Boolean).join(' ')} (${name})`.slice(0, 200),
        storage_path: path,
        mime,
        size: Number(b.size),
        visible: false,
        source: 'site',
        handover_slot: kind.handover,
        release: 'with_pack',
      });
      if (error && error.code !== '23505') return siteJson({ error: 'busy', message: 'That file didn’t save. It will try again.' }, 503);
    }
    const { data: row } = await s.db.from('crm_documents').select('id, name, mime').eq('storage_path', path).maybeSingle();
    if (!row) return siteJson({ error: 'busy', message: 'That file didn’t save. It will try again.' }, 503);
    if (a.status === 'sent' || a.status === 'opened') {
      const now = new Date().toISOString();
      await s.db.from('site_assignments').update({ status: 'started', started_at: a.started_at ?? now, updated_at: now }).eq('id', a.id).in('status', ['sent', 'opened']);
    }
    if (!have) await logSiteEvent(s.db, a.id, 'trade', 'file_saved', { slot, name, document: row.id });
    after(async () => {
      if (!have) await fingerprintDocument(String(row.id));
      const fresh = await readAssignment(s.db, a.id);
      if (fresh) await afterAnswers(s.db, fresh);
    });
    return siteJson({ file: { id: row.id, slot, name: row.name, mime: row.mime ?? mime, client_id: clientId.toLowerCase(), url: null } });
  }

  if (b.action === 'delete') {
    const { data: rows } = await s.db
      .from('crm_documents')
      .select('id, storage_path')
      .eq('project_id', a.project_id)
      .like('storage_path', `projects/${a.project_id}/site/${a.id}/%/${clientId.toLowerCase()}-%`);
    if (signed && (rows ?? []).length) return siteJson({ error: 'signed', message: 'Files on a signed-off form stay. Ask the office if one needs taking off.' }, 409);
    for (const r of (rows ?? []) as { id: string; storage_path: string }[]) {
      await s.db.storage.from(DOCS_BUCKET).remove([r.storage_path]);
      await s.db.from('crm_documents').delete().eq('id', r.id);
    }
    await logSiteEvent(s.db, a.id, 'trade', 'file_deleted', { client_id: clientId });
    return siteJson({ ok: true });
  }
  return siteJson({ error: 'bad', message: 'Unknown action' }, 400);
}
