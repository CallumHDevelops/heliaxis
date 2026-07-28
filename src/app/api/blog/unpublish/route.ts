import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { unpublishCmsBlog } from '@/lib/blog/cms-blog-schedule';

export const dynamic = 'force-dynamic';

/** Take a live AI blog offline (draft remains editable). */
export async function POST(req: Request) {
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

  if (!body.id && !body.slug) {
    return NextResponse.json({ error: 'id or slug is required' }, { status: 400 });
  }

  try {
    const result = await unpublishCmsBlog({ id: body.id, slug: body.slug });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not unpublish' },
      { status: 400 },
    );
  }
}
