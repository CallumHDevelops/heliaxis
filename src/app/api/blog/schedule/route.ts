import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { cancelCmsBlogSchedule, scheduleCmsBlog } from '@/lib/blog/cms-blog-schedule';

export const dynamic = 'force-dynamic';

/** Schedule an AI blog for automatic publish. HTML is optional — built from draft when omitted. */
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
  if (!body.id && !body.slug) {
    return NextResponse.json({ error: 'id or slug is required' }, { status: 400 });
  }

  try {
    const result = await scheduleCmsBlog({
      id: body.id,
      slug: body.slug,
      publishAt: body.publishAt,
      renderedPage: body.renderedPage,
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
