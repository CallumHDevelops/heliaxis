import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsConfigured } from '@/lib/dataforseo/client';
import { runCompetitorAnalysis } from '@/lib/seo/serp';
import { runWeekly } from '@/lib/seo/server';
import { collectTask, finishIfComplete, readyTaskIds, startSerpRun } from './serp-run';
import { plannedJobs } from './schedule';
import { importSearchConsole } from './gsc';
import { importRankedKeywords } from './labs';
import { runSetupCheck } from './checklist';
import { buildWeeklyReport } from './reports';

/**
 * The growth dispatcher (spec §7): /api/cron/growth runs every 10 minutes (Supabase pg_cron). It queues whatever the
 * schedule says is due, nudges forward any SERP results DataForSEO says are ready, then runs due jobs within a time budget.
 */

type Db = ReturnType<typeof createAdminClient>;
type Job = { id: number; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };
type Outcome = 'done' | 'retry' | 'later';

export async function queueJob(kind: string, dedupeKey: string, payload: Record<string, unknown> = {}, db: Db = createAdminClient(), runAfter?: Date) {
  await db.from('seo_job').upsert({ kind, dedupe_key: dedupeKey, payload, ...(runAfter ? { run_after: runAfter.toISOString() } : {}) }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
}

async function runOne(job: Job, db: Db): Promise<Outcome> {
  const p = job.payload;
  switch (job.kind) {
    case 'serp_post':
      if (!dfsConfigured()) return 'done';
      await startSerpRun({ device: (p.device as 'mobile' | 'desktop') ?? 'mobile', kind: (p.kind as 'weekly' | 'monthly') ?? 'weekly', by: String(p.by ?? 'schedule'), override: !!p.override }, db);
      return 'done';
    case 'serp_collect': {
      const r = await collectTask(p as never, db);
      if (r === 'not_ready') return 'later';
      if (r === 'failed') {
        await db.from('seo_job').update({ status: 'failed', finished_at: new Date().toISOString(), last_error: 'DataForSEO returned no result' }).eq('id', job.id);
        await finishIfComplete(Number(p.runId), db);
        return 'done';
      }
      await db.from('seo_job').update({ status: 'done', finished_at: new Date().toISOString(), last_error: null }).eq('id', job.id);
      await finishIfComplete(Number(p.runId), db);
      return 'done';
    }
    case 'competitors':
      await runCompetitorAnalysis(new Date(), db);
      return 'done';
    case 'site_audit':
      await runWeekly();
      return 'done';
    case 'gsc_import':
      await importSearchConsole({ days: 4 }, db);
      return 'done';
    case 'ranked_keywords':
      await importRankedKeywords(db);
      return 'done';
    case 'setup_check':
      await runSetupCheck(db);
      return 'done';
    case 'weekly_report':
      await buildWeeklyReport({ status: (p.status as 'provisional' | 'final') ?? 'provisional' }, db);
      return 'done';
    default:
      return 'done'; // a later phase's job: nothing to do yet
  }
}

/** Pick up a collect job by DataForSEO task id (the pingback), claiming it so the dispatcher can't run it at the same time. */
export async function collectByTaskId(taskId: string, db: Db = createAdminClient()): Promise<'done' | 'busy' | 'unknown' | 'later'> {
  const { data } = await db
    .from('seo_job')
    .update({ status: 'running', locked_at: new Date().toISOString() })
    .eq('dedupe_key', `serp:${taskId}`)
    .eq('status', 'queued')
    .select('id, kind, payload, attempts, max_attempts');
  const job = data?.[0] as Job | undefined;
  if (!job) {
    const { data: any } = await db.from('seo_job').select('id').eq('dedupe_key', `serp:${taskId}`).maybeSingle();
    return any ? 'busy' : 'unknown';
  }
  const out = await settle(job, db);
  return out === 'later' ? 'later' : 'done';
}

async function settle(job: Job, db: Db): Promise<Outcome> {
  let out: Outcome;
  let message = '';
  try {
    out = await runOne(job, db);
  } catch (e) {
    out = 'retry';
    message = e instanceof Error ? e.message : 'failed';
  }
  const now = Date.now();
  // runOne already closed serp_collect jobs itself.
  if (out === 'done' && job.kind !== 'serp_collect') {
    await db.from('seo_job').update({ status: 'done', finished_at: new Date(now).toISOString(), last_error: null }).eq('id', job.id);
  } else if (out === 'later' || out === 'retry') {
    if (job.attempts >= job.max_attempts) {
      await db.from('seo_job').update({ status: 'failed', finished_at: new Date(now).toISOString(), last_error: message || 'Not ready in time' }).eq('id', job.id);
      if (job.kind === 'serp_collect') await finishIfComplete(Number(job.payload.runId), db);
    } else {
      const wait = out === 'later' ? 5 : 2 ** Math.max(0, job.attempts - 1) * 2;
      await db.from('seo_job').update({ status: 'queued', locked_at: null, run_after: new Date(now + wait * 60_000).toISOString(), last_error: message || null }).eq('id', job.id);
    }
  }
  return out;
}

export async function runSearchJobs(opts: { until?: number; db?: Db } = {}): Promise<{ queued: number; ran: number; ready: number }> {
  const db = opts.db ?? createAdminClient();
  const until = opts.until ?? Date.now() + 240_000;
  let queued = 0;
  for (const p of plannedJobs()) {
    await queueJob(p.kind, p.dedupeKey, p.payload, db);
    queued++;
  }

  // Pingbacks are the main signal; this is the fallback: bring forward any task DataForSEO says is ready.
  let ready = 0;
  const { count } = await db.from('seo_job').select('id', { count: 'exact', head: true }).eq('kind', 'serp_collect').eq('status', 'queued');
  if (count && dfsConfigured()) {
    const ids = await readyTaskIds().catch(() => [] as string[]);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await db.from('seo_job').update({ run_after: new Date().toISOString() }).in('dedupe_key', ids.slice(i, i + 100).map((id) => `serp:${id}`)).eq('status', 'queued').select('id');
      ready += data?.length ?? 0;
    }
  }

  let ran = 0;
  while (Date.now() < until) {
    const { data, error } = await db.rpc('seo_claim_jobs', { n: 8 });
    if (error || !data?.length) break;
    // Collect jobs are quick and independent: run each claimed batch together.
    await Promise.all((data as Job[]).map((j) => settle(j, db)));
    ran += data.length;
  }
  return { queued, ran, ready };
}
