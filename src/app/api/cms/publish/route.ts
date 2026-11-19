import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { keepRenderedPages, keepStudioPages } from '@/lib/cms-studio-merge';
import { blockingSummary, checkDoc, logOverride } from '@/lib/cms/checks-server';

const DRAFT_KEY = 'heliaxis-cms-v1';
const PUBLISHED_KEY = 'heliaxis-cms-published';
const RENDERED_KEY = 'heliaxis-cms-rendered';

// Publish: snapshot CMS state as published, and store client-rendered page HTML.
// Prefer the live `state` from the browser so mega-menu deletes aren't lost to a
// stale draft read (overlapping saves).
export async function POST(req: Request) {
  const session = await requirePortal('cms');
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

  // A tab opened before Search published a page doesn't have it: keep the server's studio pages (and their rendered
  // HTML) that the browser's state lacks, so this publish can't take them down.
  let keptSlugs: string[] = [];
  if (snapshot) {
    const { data: current } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
    const merged = keepStudioPages(snapshot, current?.value as string | null | undefined);
    snapshot = merged.value;
    keptSlugs = merged.kept;
  }

  // The page checks. A page that is new or changed since the last publish must have no errors, or Publish stops. An admin can publish
  // past them by giving a reason, which is kept. (Every page goes live on Publish, drafts included, so this is the last safety net.)
  if (snapshot) {
    let doc: unknown = null;
    try {
      doc = JSON.parse(snapshot);
    } catch {
      /* an unreadable snapshot is rejected below by the save, as before */
    }
    let report: Awaited<ReturnType<typeof checkDoc>> | null = null;
    if (doc && typeof doc === 'object') {
      try {
        report = await checkDoc(doc as Parameters<typeof checkDoc>[0], admin);
      } catch (e) {
        // The checks are a safety net: if they themselves fail, say so in the logs and let Publish carry on rather than stop everyone.
        console.error('Page checks failed; publishing without them:', e);
      }
    }
    if (report) {
      if (report.blocking.length) {
        const isAdmin = session.profile.role === 'admin';
        const reason = typeof body?.override?.reason === 'string' ? body.override.reason.trim() : '';
        if (!(isAdmin && reason.length >= 10)) {
          return NextResponse.json(
            {
              blocked: true,
              canOverride: isAdmin,
              error: `Publishing stopped: ${report.blocking.length} page${report.blocking.length === 1 ? '' : 's'} that ${report.blocking.length === 1 ? 'is' : 'are'} new or changed ${report.blocking.length === 1 ? 'has' : 'have'} errors in the page checks.`,
              pages: blockingSummary(report),
            },
            { status: 422 },
          );
        }
        await logOverride({ by: session.profile.full_name || session.profile.email || 'An admin', reason, pages: report.blocking.map((p) => p.slug), errors: report.blocking.reduce((n, p) => n + p.errors, 0) }, admin).catch(() => null);
      }
    }
  }

  if (snapshot) {
    // Keep draft + published in sync with what the admin just published.
    await admin.from('cms_kv').upsert({ key: DRAFT_KEY, value: snapshot, updated_at: now });
    await admin.from('cms_kv').upsert({ key: PUBLISHED_KEY, value: snapshot, updated_at: now });
  }

  if (body?.rendered) {
    let rendered: unknown = body.rendered;
    if (keptSlugs.length) {
      const { data: ren } = await admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle();
      rendered = keepRenderedPages(rendered, ren?.value as string | null | undefined, keptSlugs);
    }
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
    const pages = body?.rendered?.pages;
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
