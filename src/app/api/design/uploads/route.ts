import { createAdminClient } from '@/lib/supabase/admin';
import {
  DESIGN_BUCKET,
  IMAGE_MIME,
  MAX_IMAGE_BYTES,
  designSession,
  ensureDesignBucket,
  json,
  safeName,
} from '@/lib/design/server';

export const dynamic = 'force-dynamic';

/** The team's shared image uploads (newest first). Storage only — no SQL needed. */
export async function GET() {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  await ensureDesignBucket();
  const { data, error } = await createAdminClient()
    .storage.from(DESIGN_BUCKET)
    .list('uploads', { limit: 300, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) return json({ error: error.message, items: [] }, 500);
  const items = (data ?? [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => {
      const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
      return {
        path: `uploads/${f.name}`,
        name: f.name.replace(/^\d+-/, ''),
        size: typeof meta.size === 'number' ? meta.size : null,
        mime: meta.mimetype ?? null,
        created_at: f.created_at ?? null,
      };
    });
  return json({ items });
}

/** { action: 'prepare', name, mime, size } → { bucket, path, token } for a direct browser upload. */
export async function POST(req: Request) {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  if (b.action !== 'prepare') return json({ error: 'Unknown action' }, 400);
  const mime = String(b.mime || '');
  if (!IMAGE_MIME.includes(mime)) return json({ error: 'Upload a JPG, PNG, WebP or SVG image.' }, 400);
  if (!(Number(b.size) > 0) || Number(b.size) > MAX_IMAGE_BYTES) return json({ error: 'Images must be under 30 MB.' }, 400);
  await ensureDesignBucket();
  const path = `uploads/${Date.now()}-${safeName(String(b.name || 'image'))}`;
  const { data, error } = await createAdminClient().storage.from(DESIGN_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return json({ error: 'Could not prepare the upload — try again.' }, 500);
  return json({ bucket: DESIGN_BUCKET, path, token: data.token });
}
