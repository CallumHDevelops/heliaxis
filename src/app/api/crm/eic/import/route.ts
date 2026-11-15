import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, ensureDocsBucket, isUuid, json } from '@/lib/crm/server';
import { importCertificate, importEnabled } from '@/lib/eic-manual/import';
import { scansToday, SCANS_PER_DAY } from '@/lib/eic-manual/scan';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Import a certificate made by someone else (NICEIC, NAPIT…): { action: 'prepare', name } gives a place to send the file straight to storage
 * (a PDF is often over the host's request limit), then { action: 'import', path, enquiry_id?, project_id? } reads it, makes a draft certificate
 * from it and gives its id. The file is not kept.
 */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const b = (await req.json().catch(() => ({}))) as { action?: string; name?: string; path?: string; enquiry_id?: string; project_id?: string };
  const db = createAdminClient();
  if (b.action === 'prepare') {
    const ext = (/\.([A-Za-z0-9]{2,5})$/.exec(String(b.name ?? ''))?.[1] ?? '').toLowerCase();
    if (!TYPES[ext]) return json({ error: 'Use a PDF, or a JPEG or PNG photo.' }, 400);
    await ensureDocsBucket().catch(() => null);
    const path = `eic-import/${s.user.id}-${Date.now()}.${ext}`;
    const { data, error } = await db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Couldn’t start the upload. Try again.' }, 500);
    return json({ bucket: DOCS_BUCKET, path, token: data.token });
  }
  if (b.action !== 'import' || !b.path?.startsWith(`eic-import/${s.user.id}-`)) return json({ error: 'Choose the certificate to import.' }, 400);
  if (!importEnabled()) return json({ error: 'Reading certificates isn’t switched on for this system yet.' }, 503);
  if ((await scansToday(`eic-import:${s.user.id}`)) >= SCANS_PER_DAY) return json({ error: 'That’s a lot of imports for today. Try again tomorrow.' }, 429);
  const ext = (/\.([a-z0-9]+)$/.exec(b.path)?.[1] ?? '').toLowerCase();
  const mime = TYPES[ext];
  const { data: blob, error } = await db.storage.from(DOCS_BUCKET).download(b.path);
  if (error || !blob || !mime) return json({ error: 'Couldn’t fetch the uploaded file. Try again.' }, 422);
  if (blob.size > 25 * 1024 * 1024) return json({ error: 'That file is over 25 MB.' }, 400);
  const got = await importCertificate(Buffer.from(await blob.arrayBuffer()), mime, `eic-import:${s.user.id}`).catch((e) => {
    console.error('EIC import failed', e);
    return null;
  });
  db.storage.from(DOCS_BUCKET).remove([b.path]).catch(() => null);
  if (!got || (!Object.keys(got.values).length)) return json({ error: 'It couldn’t read that certificate. Is it an Electrical Installation Certificate? Try a clearer copy.' }, 422);

  const pick = (v: unknown) => (isUuid(String(v ?? '')) ? String(v) : null);
  let enquiry = pick(b.enquiry_id);
  const project = pick(b.project_id);
  if (project && !enquiry) {
    const { data } = await db.from('crm_projects').select('enquiry_id').eq('id', project).maybeSingle();
    enquiry = (data as { enquiry_id?: string } | null)?.enquiry_id ?? null;
  }
  const at = new Date().toISOString();
  const answers = Object.fromEntries(Object.entries(got.values).map(([k, v]) => [k, { v, src: 'scan', at }]));
  const title = `Imported from ${got.scheme ? `a ${got.scheme}` : 'another'} certificate${got.certificate_no ? ` (${got.certificate_no})` : ''}`;
  const { data: row, error: e2 } = await db.from('eic_manual').insert({ route: got.route, title, enquiry_id: enquiry, project_id: project, answers, created_by: s.user.id }).select('id').single();
  if (e2 || !row) return json({ error: e2?.message || 'Couldn’t save the certificate.' }, 500);
  return json({ id: row.id, circuits: got.circuits, boards: got.boards, left_out: got.left_out });
}
