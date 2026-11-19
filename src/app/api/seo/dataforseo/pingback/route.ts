import { after, NextResponse, type NextRequest } from 'next/server';
import { collectByTaskId } from '@/lib/search/jobs';
import { pingbackOk } from '@/lib/search/serp-run';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const tag = q.get('tag') ?? '';
  const runId = Number(tag.split(':')[0]);
  const ok = !!id && Number.isFinite(runId) && pingbackOk(runId, q.get('token') ?? '');
  // Every call is recorded (accepted or not), so we can see whether DataForSEO is calling and why one is refused.
  after(() => recordHit(ok, ok ? 'accepted' : !id ? 'no id' : !Number.isFinite(runId) ? `bad tag "${tag.slice(0, 40)}"` : 'bad token', req));
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  after(() => collectByTaskId(id).then(() => null, (e) => console.error('SEO pingback collect failed', id, e)));
  return NextResponse.json({ ok: true });
}

async function recordHit(ok: boolean, why: string, req: NextRequest) {
  try {
    await createAdminClient()
      .from('seo_api_call')
      .insert({ vendor: 'dataforseo', endpoint: `/pingback ${req.method}: ${why}`.slice(0, 200), module: 'pingback', cost_usd: 0, ok, ms: 0, tasks: 1 });
  } catch {
    /* never fail the callback over the log */
  }
}

export const POST = GET;
