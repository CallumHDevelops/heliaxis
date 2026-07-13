import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { cancelCmsBlogSchedule, scheduleCmsBlog } from '@/lib/blog/cms-blog-schedule';

export const dynamic = 'force-dynamic';

/** Schedule an AI blog for automatic publish (requires captured rendered HTML). */
export async function POST(req: Request) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    id?: string;
    slug?: string;
    publishAt?: string;
    renderedPage?: {
      slug?: string;
      name?: string;
      theme?: string;
      seo?: Record<string, unknown>;
      html?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.publishAt) {
    return NextResponse.json({ error: 'publishAt is required' }, { status: 400 });
  }
  if (!body.renderedPage?.html) {
    return NextResponse.json({ error: 'renderedPage.html is required' }, { status: 400 });
  }

  try {
    const result = await scheduleCmsBlog({
      id: body.id,
      slug: body.slug,
      publishAt: body.publishAt,
      renderedPage: {
        slug: String(body.renderedPage.slug || body.slug || ''),
        name: String(body.renderedPage.name || 'Article'),
        theme: body.renderedPage.theme,
        seo: body.renderedPage.seo,
        html: body.renderedPage.html,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not schedule' },
      { status: 400 },
    );
  }
}

/** Cancel a scheduled publish. */
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

  try {
    await cancelCmsBlogSchedule({ id: body.id, slug: body.slug });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not cancel schedule' },
      { status: 400 },
    );
  }
}
