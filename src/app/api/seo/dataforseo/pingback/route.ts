import { after, NextResponse, type NextRequest } from 'next/server';
import { collectByTaskId } from '@/lib/search/jobs';
import { pingbackOk } from '@/lib/search/serp-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * DataForSEO calls this when a queued SERP task is ready (pingback_url set in serp-run.ts, with $id and $tag filled in).
 * The token is a hash of the run id with our secret, so only DataForSEO, which we told it, can call it. The result is
 * fetched and stored after answering, so DataForSEO isn't kept waiting.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get('id') ?? '';
  const runId = Number(String(q.get('tag') ?? '').split(':')[0]);
  if (!id || !Number.isFinite(runId) || !pingbackOk(runId, q.get('token') ?? '')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  after(() => collectByTaskId(id).then(() => null, (e) => console.error('SEO pingback collect failed', id, e)));
  return NextResponse.json({ ok: true });
}

export const POST = GET;
