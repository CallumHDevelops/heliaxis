import { NextResponse } from 'next/server';
import { publishDueScheduledBlogs } from '@/lib/blog/cms-blog-schedule';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.BLOG_CRON_SECRET;
  if (!secret) {
    // Allow in local/dev without secret so scheduling can be tested
    if (process.env.NODE_ENV !== 'production') return true;
    return false;
  }
  const header = req.headers.get('authorization') || '';
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === secret) return true;
  return false;
}

/** External free ping (e.g. cron-job.org) or manual trigger.
 * URL: /api/cron/publish-scheduled-blogs?secret=CRON_SECRET
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await publishDueScheduledBlogs();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cron failed' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
