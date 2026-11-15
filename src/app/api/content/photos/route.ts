import { createAdminClient } from '@/lib/supabase/admin';
import { json } from '@/lib/crm/server';
import { contentAccess, listContentPhotos } from '@/lib/content/server';

export const dynamic = 'force-dynamic';

/** The content library's photos (CRM staff and the content team). ?category= &product= &project= &before=<created_at> */
export async function GET(req: Request) {
  const s = await contentAccess();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const q = new URL(req.url).searchParams;
  const photos = await listContentPhotos(createAdminClient(), { category: q.get('category'), product: q.get('product'), project: q.get('project'), before: q.get('before') });
  return json({ photos, manage: s.manage });
}
