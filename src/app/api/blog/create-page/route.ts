import { NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { addBlogDraft } from '@/lib/blog/cms-blog-draft';
import { cmsArticleAiSchema, placeholderCmsArticleAi, type CmsArticleAi } from '@/lib/blog/cms-article-template';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { draft?: unknown; placeholder?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let ai: CmsArticleAi;
  try {
    if (body.placeholder) {
      ai = placeholderCmsArticleAi();
      // Unique slug base so repeated placeholders never collide into /blog/…-2-2.
      const stamp = Date.now().toString(36).slice(-4);
      ai.title = 'Untitled article';
      ai.slug = `untitled-article-${stamp}`;
      ai.seoTitle = 'Untitled article — Heliaxis';
    } else {
      const raw = body.draft as Record<string, unknown>;
      if (raw && typeof raw.slug === 'string') {
        raw.slug = String(raw.slug).replace(/^\/+/, '');
      }
      ai = cmsArticleAiSchema.parse(raw);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid draft';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const page = await addBlogDraft(ai);
    return NextResponse.json({ ok: true, ...page });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create the page';
    return NextResponse.json({ error: message }, { status: message === 'That slug is reserved' ? 400 : 500 });
  }
}
