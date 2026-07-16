import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const DRAFT_KEY = 'heliaxis-cms-v1';
const PUBLISHED_KEY = 'heliaxis-cms-published';
const RENDERED_KEY = 'heliaxis-cms-rendered';

// Publish: snapshot CMS state as published, and store client-rendered page HTML.
// Prefer the live `state` from the browser so mega-menu deletes aren't lost to a
// stale draft read (overlapping saves).
export async function POST(req: Request) {
  const session = await requireApproved();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const body = await req.json().catch(() => null);

  let snapshot: string | null = null;
  if (body?.state != null) {
    snapshot = typeof body.state === 'string' ? body.state : JSON.stringify(body.state);
  }

  if (!snapshot) {
    const { data } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
    if (data?.value) snapshot = String(data.value);
  }

  if (snapshot) {
    // Keep draft + published in sync with what the admin just published.
    await admin.from('cms_kv').upsert({ key: DRAFT_KEY, value: snapshot, updated_at: now });
    await admin.from('cms_kv').upsert({ key: PUBLISHED_KEY, value: snapshot, updated_at: now });
  }

  if (body?.rendered) {
    await admin
      .from('cms_kv')
      .upsert({ key: RENDERED_KEY, value: JSON.stringify(body.rendered), updated_at: now });
  }

  // Invalidate public header (menu) + pages.
  revalidatePath('/', 'layout');
  revalidatePath('/');
  revalidatePath('/blog');
  revalidatePath('/blog', 'layout');
  revalidatePath('/solar-estimator');

  return NextResponse.json({
    ok: true,
    menuCount: (() => {
      try {
        const menu = JSON.parse(snapshot || '{}')?.site?.menu;
        return Array.isArray(menu) ? menu.length : 0;
      } catch {
        return 0;
      }
    })(),
  });
}
