import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, DOCS_BUCKET, ensureDocsBucket, isUuid, json } from '@/lib/crm/server';
import { picturesForOption } from '@/lib/quotes/proposal-images';
import { readProposal } from '@/lib/quotes/proposal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Read an OpenSolar proposal (PDF, up to 20 MB): { options } for the builder to keep on the quote. Nothing is saved here. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  let bytes: Uint8Array;
  let fileName = 'proposal.pdf';
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    // Large files go straight to storage (the host caps request bodies at about 4.5 MB), then are read from there.
    const b = (await req.json().catch(() => ({}))) as { action?: string; name?: string; path?: string };
    if (b.action === 'prepare') {
      await ensureDocsBucket().catch(() => null);
      const path = `quotes/${id}/upload-${Date.now()}.pdf`;
      const { data, error } = await db.storage.from(DOCS_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return json({ error: 'Couldn’t start the upload. Try again.' }, 500);
      return json({ bucket: DOCS_BUCKET, path, token: data.token });
    }
    if (b.action !== 'read' || !b.path?.startsWith(`quotes/${id}/upload-`)) return json({ error: 'Choose the proposal PDF.' }, 400);
    const { data: blob, error } = await db.storage.from(DOCS_BUCKET).download(b.path);
    if (error || !blob) return json({ error: 'Couldn’t fetch the uploaded file. Try again.' }, 422);
    if (blob.size > 20 * 1024 * 1024) return json({ error: 'That file is over 20 MB.' }, 400);
    bytes = new Uint8Array(await blob.arrayBuffer());
    fileName = b.name || fileName;
    db.storage.from(DOCS_BUCKET).remove([b.path]).catch(() => null);
  } else {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return json({ error: 'Choose the proposal PDF.' }, 400);
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return json({ error: 'Use the proposal as a PDF.' }, 400);
    if (file.size > 20 * 1024 * 1024) return json({ error: 'That file is over 20 MB.' }, 400);
    bytes = new Uint8Array(await file.arrayBuffer());
    fileName = file.name;
  }
  const out = await readProposal(bytes);
  if (!out.ok) return json({ error: out.error }, 422);
  // The pictures on each option's own page (and its sun-path diagram) are kept with the quote, so the design pages can show them.
  await ensureDocsBucket().catch(() => null);
  const options = await Promise.all(
    out.options.map(async (o, k) => {
      if (!o.optionPage) return o;
      try {
        const pics = await picturesForOption(bytes, Math.round(o.optionPage));
        const images: Record<string, string> = {};
        for (const [kind, img] of Object.entries(pics)) {
          if (!img) continue;
          const path = `quotes/${id}/proposal-${Date.now()}-${k}-${kind}.${img.mime === 'image/png' ? 'png' : 'jpg'}`;
          const up = await db.storage.from(DOCS_BUCKET).upload(path, img.bytes, { contentType: img.mime, upsert: false });
          if (!up.error) images[kind] = path;
        }
        return Object.keys(images).length ? { ...o, images } : o;
      } catch {
        return o;
      }
    })
  );
  return json({ options, file: fileName.slice(0, 160) });
}
