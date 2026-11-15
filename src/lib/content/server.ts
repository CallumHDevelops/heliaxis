import 'server-only';
import { requireApproved } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { CRM_BUCKET, thumbPath } from '@/lib/crm/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CONTENT_CATEGORIES, districtOf, type ContentPhoto } from './shared';

type Db = ReturnType<typeof createAdminClient>;

/** Staff with CRM access or the Social media studio tick: who can see the library. `manage` is CRM staff, who can hide photos and stop sharing a project. */
export async function contentAccess() {
  const s = await requireApproved();
  if (!s) return null;
  const manage = canAccess(s.profile, 'crm');
  if (!manage && !canAccess(s.profile, 'social')) return null;
  return { ...s, manage };
}

type Row = {
  id: string;
  project_id: string;
  category: string;
  storage_path: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  created_at: string;
  crm_projects: { project_ref: string | null; title: string | null; products: string[] | null; postcode: string | null; system: Record<string, unknown> | null };
};

/**
 * The photos available to the content team, newest first: projects shared for content, photos not hidden, work photos only. `before` pages back
 * through them. Links are signed for `seconds`.
 */
export async function listContentPhotos(db: Db, o: { limit?: number; before?: string | null; after?: string | null; category?: string | null; product?: string | null; project?: string | null; seconds?: number } = {}): Promise<ContentPhoto[]> {
  const limit = Math.min(200, Math.max(1, o.limit ?? 60));
  let q = db
    .from('crm_photos')
    .select('id, project_id, category, storage_path, caption, width, height, taken_at, created_at, crm_projects!inner(project_ref, title, products, postcode, system)')
    .eq('content_hidden', false)
    .eq('crm_projects.content_ok', true)
    .in('category', o.category && (CONTENT_CATEGORIES as readonly string[]).includes(o.category) ? [o.category] : [...CONTENT_CATEGORIES])
    .order('created_at', { ascending: o.after ? true : false })
    .limit(limit);
  if (o.before) q = q.lt('created_at', o.before);
  if (o.after) q = q.gt('created_at', o.after);
  if (o.project) q = q.eq('project_id', o.project);
  if (o.product) q = q.contains('crm_projects.products', [o.product]);
  const { data } = await q;
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => !/\/survey\//.test(r.storage_path));
  const store = db.storage.from(CRM_BUCKET);
  const secs = o.seconds ?? 3600;
  const [full, thumbs] = await Promise.all([store.createSignedUrls(rows.map((r) => r.storage_path), secs), store.createSignedUrls(rows.map((r) => thumbPath(r.storage_path)), secs)]);
  const url = (list: { path: string | null; signedUrl: string }[] | null, p: string) => list?.find((x) => x.path === p)?.signedUrl ?? null;
  return rows.map((r) => {
    const sys = r.crm_projects.system ?? {};
    const kwp = typeof sys.kwp === 'number' ? sys.kwp : null;
    return {
      id: r.id,
      project_id: r.project_id,
      ref: r.crm_projects.project_ref,
      title: r.crm_projects.title ?? '',
      products: r.crm_projects.products ?? [],
      kwp,
      area: districtOf(r.crm_projects.postcode),
      category: r.category,
      caption: r.caption,
      taken_at: r.taken_at,
      created_at: r.created_at,
      width: r.width,
      height: r.height,
      thumb: url(thumbs.data as never, thumbPath(r.storage_path)),
      url: url(full.data as never, r.storage_path),
    };
  });
}
