import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { addArticleToState, slugTaken, type CmsPages } from '@/lib/blog/add-article';
import { toPublicBlogPath } from '@/lib/blog/cms-article-template';
import { BLOG_DRAFTS } from '@/content/blog-drafts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DRAFT_KEY = 'heliaxis-cms-v1';

/** What is waiting to be loaded: the drafts in the repo, and which are already in the CMS. */
export async function GET() {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  let pages: CmsPages = [];
  try {
    pages = (JSON.parse(data?.value ?? '{}') as { pages?: CmsPages }).pages ?? [];
  } catch {
    pages = [];
  }
  return NextResponse.json({
    drafts: BLOG_DRAFTS.map((d) => ({ slug: d.slug, title: d.title, loaded: slugTaken(pages, toPublicBlogPath(d.slug)), notes: d.editorNotes?.length ?? 0 })),
  });
}

/**
 * Load the written articles into the CMS as drafts (admin only). Ones already there are skipped, so pressing it again adds nothing twice.
 * They are not published: each one is reviewed, then scheduled or published from the CMS as usual.
 */
export async function POST() {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let state: { pages?: CmsPages; current?: number; [k: string]: unknown };
  try {
    state = data?.value ? JSON.parse(data.value) : { pages: [], current: 0, site: {} };
  } catch {
    return NextResponse.json({ error: 'CMS draft is corrupt' }, { status: 500 });
  }
  if (!Array.isArray(state.pages)) state.pages = [];
  const added: string[] = [];
  const skipped: string[] = [];
  for (const d of BLOG_DRAFTS) {
    if (slugTaken(state.pages, toPublicBlogPath(d.slug))) {
      skipped.push(d.slug);
      continue;
    }
    const { slug } = await addArticleToState(state.pages, d);
    added.push(slug);
  }
  if (added.length) {
    const { error: upErr } = await admin.from('cms_kv').upsert({ key: DRAFT_KEY, value: JSON.stringify(state), updated_at: new Date().toISOString() });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, added, skipped });
}
