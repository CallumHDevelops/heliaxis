import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCmsBlogPage, normalizeCmsSlug } from '@/lib/blog/cms-article-template';

export const dynamic = 'force-dynamic';

const DRAFT_KEY = 'heliaxis-cms-v1';
const PUBLISHED_KEY = 'heliaxis-cms-published';
const RENDERED_KEY = 'heliaxis-cms-rendered';

type LoosePage = {
  id?: string;
  slug?: string;
  type?: string;
  origin?: string;
  blocks?: Array<{ t?: string }>;
  [key: string]: unknown;
};

type CmsState = { pages?: LoosePage[]; current?: number; [key: string]: unknown };

function parseState(raw: string | null | undefined): CmsState {
  if (!raw) return { pages: [] };
  try {
    return JSON.parse(raw) as CmsState;
  } catch {
    return { pages: [] };
  }
}

function matchBlog(pg: LoosePage, id?: string, slug?: string): boolean {
  if (!isCmsBlogPage(pg)) return false;
  if (id && String(pg.id) === id) return true;
  if (slug && normalizeCmsSlug(String(pg.slug || '')) === normalizeCmsSlug(slug)) return true;
  return false;
}

/** Delete an AI blog from CMS draft (+ published / rendered snapshots when present). */
export async function DELETE(req: Request) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { id?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id?.trim();
  const slugIn = body.slug?.trim();
  if (!id && !slugIn) {
    return NextResponse.json({ error: 'id or slug required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const state = parseState(data?.value);
  if (!Array.isArray(state.pages)) state.pages = [];

  const hit =
    (id ? state.pages.find((p) => String(p.id) === id) : undefined) ||
    state.pages.find((p) => matchBlog(p, id, slugIn)) ||
    (slugIn
      ? state.pages.find((p) => normalizeCmsSlug(String(p.slug || '')) === normalizeCmsSlug(slugIn))
      : undefined);
  if (!hit) {
    return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
  }

  const deletedSlug = normalizeCmsSlug(String(hit.slug || slugIn || ''));
  const deletedId = String(hit.id || '');
  state.pages = state.pages.filter((p) => {
    if (deletedId && String(p.id) === deletedId) return false;
    if (deletedSlug && normalizeCmsSlug(String(p.slug || '')) === deletedSlug) return false;
    return true;
  });
  if (typeof state.current === 'number' && state.current >= state.pages.length) {
    state.current = Math.max(0, state.pages.length - 1);
  }

  const { error: upErr } = await admin.from('cms_kv').upsert({
    key: DRAFT_KEY,
    value: JSON.stringify(state),
    updated_at: now,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pubData } = await admin.from('cms_kv').select('value').eq('key', PUBLISHED_KEY).maybeSingle();
  if (pubData?.value) {
    const pub = parseState(pubData.value);
    if (Array.isArray(pub.pages)) {
      const next = pub.pages.filter(
        (p) => normalizeCmsSlug(String(p.slug || '')) !== deletedSlug && !matchBlog(p, id, deletedSlug),
      );
      if (next.length !== pub.pages.length) {
        pub.pages = next;
        await admin.from('cms_kv').upsert({
          key: PUBLISHED_KEY,
          value: JSON.stringify(pub),
          updated_at: now,
        });
      }
    }
  }

  const { data: renData } = await admin.from('cms_kv').select('value').eq('key', RENDERED_KEY).maybeSingle();
  if (renData?.value) {
    try {
      const rendered = JSON.parse(renData.value) as { pages?: Array<{ slug?: string }>; css?: string };
      if (Array.isArray(rendered.pages)) {
        const filtered = rendered.pages.filter(
          (p) => normalizeCmsSlug(String(p.slug || '')) !== deletedSlug,
        );
        if (filtered.length !== rendered.pages.length) {
          rendered.pages = filtered;
          await admin.from('cms_kv').upsert({
            key: RENDERED_KEY,
            value: JSON.stringify(rendered),
            updated_at: now,
          });
        }
      }
    } catch {
      /* ignore corrupt rendered */
    }
  }

  revalidatePath('/', 'layout');
  revalidatePath('/blog');
  return NextResponse.json({ ok: true, slug: deletedSlug });
}
