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
import { runBusinessProfiles, runPageFacts, runTeardowns } from './teardown/server';
import { collectGridScans, startGridScans } from './local/grid-run';
import { importBusinessProfile } from './local/gbp';
import { runKeywordResearch, runOpportunityScoring } from './planner';
import { runContentMeasures } from './studio/measure-job';
import { AUTO_BY, runAutoDraftFollowUp, runAutoDraftWeekly } from './studio/auto';
import { runAiSamplingStep, startAiSampling } from './ai/sampler';
import { runHealthChecks, runIndexChecks } from './health/server';
import { buildMonthlyReport, sendReport } from './reporting/server';

/**
 * The growth dispatcher (spec §7): /api/cron/growth runs every 10 minutes (Supabase pg_cron). It queues whatever the
 * schedule says is due, nudges forward any SERP results DataForSEO says are ready, then runs due jobs within a time budget.
 */

type Db = ReturnType<typeof createAdminClient>;
type Job = { id: number; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };
/** done; retry (failed, back off); later (not ready yet, counts as a try); again (more to do, carry on next tick). */
type Outcome = 'done' | 'retry' | 'later' | 'again';

export async function queueJob(kind: string, dedupeKey: string, payload: Record<string, unknown> = {}, db: Db = createAdminClient(), runAfter?: Date) {
  await db.from('seo_job').upsert({ kind, dedupe_key: dedupeKey, payload, ...(runAfter ? { run_after: runAfter.toISOString() } : {}) }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
}

async function runOne(job: Job, db: Db, until: number): Promise<Outcome> {
  const p = job.payload;
  // Every job stops by the dispatcher's deadline, so nothing is paid for and then cut off by the function limit.
  const left = (ms: number) => Math.max(5_000, Math.min(ms, until - Date.now()));
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
    case 'weekly_report': {
      const status = (p.status as 'provisional' | 'final') ?? 'provisional';
      const id = await buildWeeklyReport({ status }, db);
      if (status === 'final') await queueJob('send_report', `send_report:${id}`, { reportId: id }, db);
      return 'done';
    }
    case 'send_report':
      await sendReport(Number(p.reportId), db);
      return 'done';

    // ── M2 teardown: bounded steps, carried on next tick while there is more ──
    case 'page_facts':
      return (await runPageFacts(db)).remaining > 0 ? 'again' : 'done';
    case 'teardowns':
      return (await runTeardowns(db, { limit: 2 })).remaining > 0 ? 'again' : 'done';
    case 'business_profiles': {
      const r = await runBusinessProfiles(db);
      // Reviews tasks come back over the next few ticks: keep collecting for a while after posting.
      return r.remaining > 0 || (r.posted > 0 && Number(p.rounds ?? 0) < 12) ? 'again' : 'done';
    }

    // ── M5 local ──
    case 'grid_start':
      await startGridScans(db);
      return 'done';
    case 'grid_collect':
      await collectGridScans(db, { until: Date.now() + left(120_000) });
      return 'done';
    case 'gbp_import':
      await importBusinessProfile(db);
      return 'done';

    // ── M3 planner ──
    case 'keyword_research':
      return (await runKeywordResearch(db, { budgetMs: left(60_000) })).done ? 'done' : 'again';
    case 'opportunity_scoring':
      await runOpportunityScoring(db);
      return 'done';

    // ── M4 content studio ──
    case 'content_measures':
      await runContentMeasures(db);
      return 'done';
    case 'auto_draft_weekly':
      await runAutoDraftWeekly(db);
      return 'done';
    case 'auto_draft_followup':
      await runAutoDraftFollowUp(db);
      return 'done';

    // ── M6 AI answers ──
    case 'ai_sample_start':
      await startAiSampling(db);
      return 'done';
    case 'ai_sample_step':
      await runAiSamplingStep(db, { until: Date.now() + left(200_000) });
      return 'done';

    // ── M7 health and reports ──
    case 'health_checks':
      return (await runHealthChecks(db, { budgetMs: left(230_000) })).more ? 'again' : 'done';
    case 'index_checks':
      await runIndexChecks(db, { budgetMs: left(200_000) });
      return 'done';
    case 'monthly_report': {
      const r = await buildMonthlyReport(db);
      if (r.status === 'final' && !r.frozen) await queueJob('send_report', `send_report:${r.id}`, { reportId: r.id }, db);
      // Provisional (Search Console still lagging): build it again once the month's data is complete.
      if (r.status !== 'final' && 'finalOn' in r && r.finalOn) await queueJob('monthly_report', `monthly_report:final:${r.finalOn}`, {}, db, new Date(`${r.finalOn}T07:00:00Z`));
      return 'done';
    }
    default:
      return 'done'; // an unknown kind: nothing to do
  }
}

/**
 * Work that continues while something is open (grid scans waiting for results, an AI-answer run in progress, a SERP
 * run's page facts): one job per 10-minute slot, so it carries on each tick until the work is finished.
 */
async function queueWhileOpen(db: Db) {
  const slot = new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString().slice(0, 16);
  const [{ count: grids }, { count: ai }] = await Promise.all([
    db.from('seo_grid_scan').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
    db.from('ai_run').select('id', { count: 'exact', head: true }).eq('status', 'running'),
  ]);
  if (grids) await queueJob('grid_collect', `grid_collect:${slot}`, {}, db);
  if (ai) await queueJob('ai_sample_step', `ai_sample_step:${slot}`, {}, db);
  // Auto-started pages waiting for their proof pack: check hourly, so a completed pack is drafted within the hour.
  const { count: waiting } = await db.from('seo_content').select('id', { count: 'exact', head: true }).eq('created_by', AUTO_BY).in('status', ['proof', 'draft']);
  if (waiting) await queueJob('auto_draft_followup', `auto_draft_followup:${slot.slice(0, 13)}`, {}, db);
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

async function settle(job: Job, db: Db, until = Date.now() + 240_000): Promise<Outcome> {
  let out: Outcome;
  let message = '';
  try {
    out = await runOne(job, db, until);
  } catch (e) {
    out = 'retry';
    message = e instanceof Error ? e.message : 'failed';
  }
  const now = Date.now();
  // runOne already closed serp_collect jobs itself.
  if (out === 'done' && job.kind !== 'serp_collect') {
    await db.from('seo_job').update({ status: 'done', finished_at: new Date(now).toISOString(), last_error: null }).eq('id', job.id);
  } else if (out === 'again') {
    // More to do: carry on at the next tick. It doesn't use up a try, but stops after 150 rounds whatever happens.
    const rounds = Number(job.payload.rounds ?? 0) + 1;
    if (rounds > 150) {
      await db.from('seo_job').update({ status: 'failed', finished_at: new Date(now).toISOString(), last_error: 'Still unfinished after 150 rounds' }).eq('id', job.id);
    } else {
      await db
        .from('seo_job')
        .update({ status: 'queued', locked_at: null, attempts: Math.max(0, job.attempts - 1), payload: { ...job.payload, rounds }, run_after: new Date(now + 60_000).toISOString(), last_error: null })
        .eq('id', job.id);
    }
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
  await queueWhileOpen(db).catch((e) => console.error('Search: queueWhileOpen failed', e));

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
  // Claim new work only while there is time to finish it: the slow jobs need up to two minutes.
  while (Date.now() < until - 120_000) {
    const { data, error } = await db.rpc('seo_claim_jobs', { n: 8 });
    if (error || !data?.length) break;
    // Collect jobs are quick and independent: run each claimed batch together.
    await Promise.all((data as Job[]).map((j) => settle(j, db, until)));
    ran += data.length;
  }
  return { queued, ran, ready };
}
