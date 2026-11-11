import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { ensureVideoBucket, VIDEO_BUCKET, VIDEO_MAX_BYTES, VIDEO_MIME } from '@/lib/writeups/video';

export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };

/** Start a video upload: { mime, size } → a signed upload for the browser to send the file straight to storage (videos are too big to pass through here). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = (await req.json().catch(() => ({}))) as { mime?: string; size?: number };
  const mime = String(b.mime || '');
  if (!VIDEO_MIME.includes(mime)) return json({ error: 'Use an MP4, MOV or WebM video.' }, 400);
  if (Number(b.size) > VIDEO_MAX_BYTES) return json({ error: 'That video is over 100 MB. Shorten or compress it first.' }, 400);
  const db = createAdminClient();
  const { data: w } = await db.from('crm_writeups').select('id').eq('id', id).maybeSingle();
  if (!w) return json({ error: 'Not found' }, 404);
  await ensureVideoBucket().catch(() => null);
  const path = `writeups/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${EXT[mime]}`;
  const { data, error } = await db.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return json({ error: 'Couldn’t start the upload. Try again.' }, 500);
  return json({ bucket: VIDEO_BUCKET, path, token: data.token });
}
