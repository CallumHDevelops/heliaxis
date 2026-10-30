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
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose the proposal PDF.' }, 400);
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return json({ error: 'Use the proposal as a PDF.' }, 400);
  if (file.size > 20 * 1024 * 1024) return json({ error: 'That file is over 20 MB.' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const out = await readProposal(bytes);
  if (!out.ok) return json({ error: out.error }, 422);
  // The pictures on each option's own page (and its sun-path diagram) are kept with the quote, so the design pages can show them.
  const db = createAdminClient();
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
  return json({ options, file: file.name.slice(0, 160) });
}
