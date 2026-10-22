import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCmsState, type CmsState } from '@/lib/blog/cms-blog-shared';
import { keepServerBlogStatus, liveRenderedPages, withoutOfflineBlogs } from '@/lib/blog/cms-publish-rules';

const DRAFT_KEY = 'heliaxis-cms-v1';
const PUBLISHED_KEY = 'heliaxis-cms-published';
const RENDERED_KEY = 'heliaxis-cms-rendered';

// Publish: snapshot CMS state as published, and store client-rendered page HTML.
// Prefer the live `state` from the browser so mega-menu deletes aren't lost to a
// stale draft read (overlapping saves). Blog articles keep the status saved here,
// except `publishBlogId` (the article being published), and only live articles go
// into the published copy and the rendered pages (src/lib/blog/cms-publish-rules.ts).
export async function POST(req: Request) {
  const session = await requirePortal('cms');
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const body = await req.json().catch(() => null);

  const { data: saved, error: readErr } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (readErr) return NextResponse.json({ error: 'Couldn’t read the saved site. Try again.' }, { status: 500 });
  const server = parseCmsState(saved?.value);
  const publishId = typeof body?.publishBlogId === 'string' && body.publishBlogId ? body.publishBlogId : null;

  let state: CmsState | null = null;
  if (body?.state != null) {
    try {
      state = (typeof body.state === 'string' ? JSON.parse(body.state) : body.state) as CmsState;
    } catch {
      return NextResponse.json({ error: 'Publish failed: the site data didn’t arrive whole. Try again.' }, { status: 400 });
    }
  } else if (saved?.value) {
    state = server;
  }
  if (state) state = keepServerBlogStatus(state, server, publishId);
  const snapshot = state ? JSON.stringify(state) : null;

  if (state && snapshot) {
    // Keep draft + published in sync with what the admin just published.
    await admin.from('cms_kv').upsert({ key: DRAFT_KEY, value: snapshot, updated_at: now });
    await admin.from('cms_kv').upsert({ key: PUBLISHED_KEY, value: JSON.stringify(withoutOfflineBlogs(state)), updated_at: now });
  }

  const rendered = body?.rendered
    ? { ...body.rendered, pages: Array.isArray(body.rendered.pages) ? liveRenderedPages(body.rendered.pages, state ?? server) : body.rendered.pages }
    : null;
  if (rendered) {
    await admin
      .from('cms_kv')
      .upsert({ key: RENDERED_KEY, value: JSON.stringify(rendered), updated_at: now });
  }

  // Invalidate public header (menu) + pages.
  revalidatePath('/', 'layout');
  revalidatePath('/');
  revalidatePath('/blog');
  revalidatePath('/blog', 'layout');
  revalidatePath('/solar-estimator');

  try {
    const pages = rendered?.pages;
    if (Array.isArray(pages)) {
      for (const pg of pages) {
        const slug = String(pg?.slug || '').trim();
        if (!slug || slug === '/') continue;
        const path = slug.startsWith('/') ? slug : `/${slug}`;
        revalidatePath(path);
      }
    }
  } catch {
    /* non-fatal */
  }

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
