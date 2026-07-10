import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isSanityWriteConfigured, publishDueScheduledPosts } from '@/lib/blog/sanity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.BLOG_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret;
}

/** Vercel Cron / manual: flip due scheduled posts → published and revalidate. */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSanityWriteConfigured()) {
    return NextResponse.json({ error: 'Sanity write not configured', updated: [] }, { status: 503 });
  }

  try {
    const updated = await publishDueScheduledPosts();
    if (updated.length) {
      revalidatePath('/blog');
      revalidatePath('/blog', 'layout');
      revalidatePath('/sitemap.xml');
      for (const p of updated) {
        revalidatePath(`/blog/${p.slug}`);
      }
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Publish-due failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
