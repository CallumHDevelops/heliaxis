import { createAdminClient } from '@/lib/supabase/admin';
import {
  DESIGN_BUCKET,
  NOT_READY,
  cleanDoc,
  cleanName,
  designReady,
  designSession,
  isUuid,
  json,
  saveThumb,
} from '@/lib/design/server';

export const dynamic = 'force-dynamic';

/** Saved designs, newest first, with a signed thumbnail URL each. */
export async function GET() {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ ready: false, items: [] });
  const db = createAdminClient();
  const { data, error } = await db
    .from('design_projects')
    .select('id, name, format_id, updated_at, thumb_path')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) return json({ error: error.message, items: [] }, 500);

  const paths = (data ?? []).map((p) => p.thumb_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await db.storage.from(DESIGN_BUCKET).createSignedUrls(paths, 3600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  return json({
    ready: true,
    items: (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      format_id: p.format_id,
      updated_at: p.updated_at,
      thumb_url: p.thumb_path ? (signed.get(p.thumb_path) ?? null) : null,
    })),
  });
}

/** Save a new design. Body: { name, doc, thumb? } (thumb = small JPEG data URL). */
export async function POST(req: Request) {
  const s = await designSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await designReady())) return json({ error: NOT_READY }, 409);
  const b = await req.json().catch(() => ({}));
  const clean = cleanDoc(b.doc);
  if (!clean.ok) return json({ error: clean.error }, 400);

  const lib = clean.doc.template?.libraryId;
  const db = createAdminClient();
  const { data, error } = await db
    .from('design_projects')
    .insert({
      name: cleanName(b.name),
      format_id: String(clean.doc.formatId || 'custom').slice(0, 40),
      doc: clean.doc,
      template_id: lib && isUuid(lib) ? lib : null,
      created_by: s.user.id,
      updated_by: s.user.id,
    })
    .select('id, name, format_id, updated_at')
    .single();
  if (error) return json({ error: error.message }, 500);

  const thumb = await saveThumb(data.id, b.thumb);
  if (thumb) await db.from('design_projects').update({ thumb_path: thumb }).eq('id', data.id);
  return json({ item: data });
}
