import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKv } from '@/lib/kv-json';
import { dfs, dfsConfigured, PRICE, serpTaskCost, type DfsTask } from '@/lib/dataforseo/client';
import { ourPlace, parseSerp, type SerpResult, type SerpSnapshot } from '@/lib/seo/rankings';
import { townLocations, ukDay } from '@/lib/seo/serp';
import { checkCap, getSetting } from './server';
import { clearAction, raiseAction } from './inbox';

/**
 * M1's weekly SERP run on DataForSEO's standard queue (spec §4.1, §7): depth 100, a phone in each search's town, goto links
 * and poisoned results resolved, the AI Overview loaded. Tasks are posted in one go; each result arrives by pingback (or
 * the dispatcher polls for it), is saved raw to Storage, parsed and written to seo_serp_result / seo_serp_item. Nothing
 * waits inside a request, so the five-minute function limit no longer matters.
 */

type Db = ReturnType<typeof createAdminClient>;
type Device = 'mobile' | 'desktop';
type Keyword = { id: number; phrase: string; town: string | null; location_code: number | null; location_name: string | null; priority: number; legacy_id: number | null; devices: string[] };

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');
const RAW_BUCKET = 'seo-raw';
/** Collect jobs retry every 5 minutes for up to about 3 hours before a task counts as failed. */
const COLLECT_TRIES = 36;

/* ── Pingback token: DataForSEO calls us back; only it knows the token for a given task ───────────────────────── */

const secret = () => process.env.DATAFORSEO_PINGBACK_SECRET || process.env.CRON_SECRET || 'dev-only';
export const pingbackToken = (runId: number) => createHmac('sha256', secret()).update(`seo-run:${runId}`).digest('hex').slice(0, 32);
export function pingbackOk(runId: number, token: string): boolean {
  const want = Buffer.from(pingbackToken(runId));
  const got = Buffer.from(String(token ?? ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

/* ── Posting a run ─────────────────────────────────────────────────────────────────────────────────────────────── */

export type RunEstimate = { searches: number; usd: number };

export async function activeKeywords(device: Device, db: Db = createAdminClient()): Promise<Keyword[]> {
  const { data, error } = await db.from('seo_keyword').select('id, phrase, town, location_code, location_name, priority, legacy_id, devices').eq('active', true).order('id');
  if (error) throw new Error(error.message);
  // Mobile weekly for every search; desktop (monthly) for every search too, whatever its own device list says.
  return ((data ?? []) as Keyword[]).filter((k) => device === 'desktop' || (k.devices ?? ['mobile']).includes(device));
}

export async function estimateRun(device: Device = 'mobile', db: Db = createAdminClient()): Promise<RunEstimate> {
  const n = (await activeKeywords(device, db)).length;
  return { searches: n, usd: Math.round(n * serpTaskCost(100) * 10000) / 10000 };
}

/** Fill in each search's DataForSEO location from its town (looked up once, then kept on the keyword). */
async function withLocations(kws: Keyword[], db: Db): Promise<Keyword[]> {
  const missing = [...new Set(kws.filter((k) => !k.location_code && k.town).map((k) => k.town!))];
  if (!missing.length) return kws;
  const locs = await townLocations(missing, db);
  for (const k of kws) {
    if (k.location_code || !k.town || !locs[k.town]) continue;
    k.location_code = locs[k.town].code;
    k.location_name = locs[k.town].name;
    await db.from('seo_keyword').update({ location_code: k.location_code, location_name: k.location_name }).eq('id', k.id);
  }
  return kws;
}

/** Options DataForSEO may not know yet on this account; dropped and retried if it rejects them. */
const OPTIONAL_FIELDS = ['resolve_goto_urls', 'resolve_poisoned_results', 'load_async_ai_overview'] as const;

function taskBody(k: Keyword, device: Device, runId: number, drop: Set<string>) {
  const body: Record<string, unknown> = {
    keyword: k.phrase,
    location_code: k.location_code ?? 2826,
    language_code: 'en',
    device,
    os: device === 'mobile' ? 'android' : 'windows',
    depth: 100,
    tag: `${runId}:${k.id}`,
    pingback_url: `${SITE()}/api/seo/dataforseo/pingback?id=$id&tag=$tag&token=${pingbackToken(runId)}`,
    resolve_goto_urls: true,
    resolve_poisoned_results: true,
    load_async_ai_overview: true,
  };
  for (const f of drop) delete body[f];
  return body;
}

/** Post every active search for a device to the standard queue. Returns the run id. */
export async function startSerpRun(opts: { device?: Device; kind?: 'weekly' | 'monthly' | 'live'; by?: string; override?: boolean } = {}, db: Db = createAdminClient()): Promise<number> {
  if (!dfsConfigured()) throw new Error('DataForSEO is not set up: add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (or DATAFORSEO_BASE64).');
  const device = opts.device ?? 'mobile';
  const kws = await withLocations(await activeKeywords(device, db), db);
  if (!kws.length) throw new Error('No searches to check: the keyword list is empty.');
  await checkCap(kws.length * serpTaskCost(100), { override: opts.override }, db);

  const { data: run, error } = await db
    .from('seo_serp_run')
    .insert({ kind: opts.kind ?? 'weekly', device, run_date: ukDay(), status: 'posting', tasks: kws.length, started_by: opts.by ?? 'schedule' })
    .select('id')
    .single();
  if (error || !run) throw new Error(error?.message ?? 'Could not start the run');
  const runId = run.id as number;

  const drop = new Set<string>();
  let cost = 0;
  let failed = 0;
  try {
    for (let i = 0; i < kws.length; i += 100) {
      const batch = kws.slice(i, i + 100);
      let tasks: DfsTask[] = [];
      for (let attempt = 0; attempt < OPTIONAL_FIELDS.length + 1; attempt++) {
        const r = await dfs('/serp/google/organic/task_post', batch.map((k) => taskBody(k, device, runId, drop)), { module: 'm1' });
        tasks = r.tasks;
        cost += r.cost;
        // "Invalid Field: 'resolve_goto_urls'": drop that option and post the batch again.
        const bad = tasks.map((t) => /invalid field[^']*'([^']+)'/i.exec(t.status_message)?.[1]).find((f) => f && (OPTIONAL_FIELDS as readonly string[]).includes(f));
        if (!bad) break;
        drop.add(bad);
      }
      const jobs = tasks.map((t, j) => ({ t, k: batch[j] })).filter(({ t }) => t.status_code === 20100 || t.status_code === 20000);
      failed += batch.length - jobs.length;
      if (jobs.length) {
        await db.from('seo_job').insert(
          jobs.map(({ t, k }) => ({
            kind: 'serp_collect',
            dedupe_key: `serp:${t.id}`,
            payload: { runId, keywordId: k.id, device, taskId: t.id, date: ukDay() },
            run_after: new Date(Date.now() + 4 * 60_000).toISOString(),
            max_attempts: COLLECT_TRIES,
            cost_usd: Number(t.cost ?? 0),
          })),
        );
      }
      for (const { t, k } of tasks.map((t, j) => ({ t, k: batch[j] })).filter(({ t }) => t.status_code !== 20100 && t.status_code !== 20000)) {
        await db.from('seo_serp_result').upsert({ keyword_id: k.id, date: ukDay(), device, run_id: runId, error: t.status_message || 'Not accepted' });
      }
    }
    const note = drop.size ? `DataForSEO did not accept: ${[...drop].join(', ')}` : null;
    await db.from('seo_serp_run').update({ status: 'waiting', cost_usd: cost, tasks_failed: failed, error: note }).eq('id', runId);
  } catch (e) {
    await db.from('seo_serp_run').update({ status: 'failed', finished_at: new Date().toISOString(), cost_usd: cost, error: e instanceof Error ? e.message : 'Failed' }).eq('id', runId);
    await raiseAction({ kind: 'budget', ref: `run:${runId}`, title: 'A rankings run failed', why: e instanceof Error ? e.message : 'Failed', fixHref: '/admin/search/settings/budget' }, db);
    throw e;
  }
  return runId;
}

/* ── Collecting one task ───────────────────────────────────────────────────────────────────────────────────────── */

export type CollectOutcome = 'done' | 'not_ready' | 'failed';
type CollectPayload = { runId: number; keywordId: number; device: Device; taskId: string; date: string };

export async function collectTask(p: CollectPayload, db: Db = createAdminClient()): Promise<CollectOutcome> {
  const { tasks } = await dfs(`/serp/google/organic/task_get/advanced/${p.taskId}`, undefined, { module: 'm1', timeoutMs: 45_000, log: false });
  const task = tasks[0];
  if (!task) return 'not_ready';
  // 40601 / 40602: handed to the queue / still in it.
  if (task.status_code === 40601 || task.status_code === 40602 || task.status_code === 40100) return 'not_ready';
  const result = task.result?.[0] as Record<string, unknown> | undefined;
  const items = (result?.items as unknown[] | undefined) ?? null;
  if (task.status_code !== 20000 && !items?.length) {
    await db.from('seo_serp_result').upsert({ keyword_id: p.keywordId, date: p.date, device: p.device, run_id: p.runId, task_id: p.taskId, error: task.status_message || 'No result' });
    return 'failed';
  }
  await saveRaw(p.date, p.taskId, task, db);
  await writeResult(p, items ?? [], result ?? {}, db);
  return 'done';
}

async function saveRaw(date: string, taskId: string, task: unknown, db: Db) {
  try {
    await db.storage.from(RAW_BUCKET).upload(`${date}/${taskId}.json.gz`, gzipSync(Buffer.from(JSON.stringify(task))), { contentType: 'application/gzip', upsert: true });
  } catch {
    /* the raw copy is a convenience; the parsed result is what matters */
  }
}

/** Parse and store one search's result (also used to re-run the parser over raw files for free). */
export async function writeResult(p: CollectPayload, items: unknown[], result: Record<string, unknown>, db: Db = createAdminClient()) {
  const parsed = parseSerp(items);
  const ours = ourPlace(parsed.organic, parsed.localPack);
  const restored = items.some((x) => (x as Record<string, unknown>)?.is_poisoned_restored === true) || result.poisoned_results_restored === true;
  await db.from('seo_serp_result').upsert({
    keyword_id: p.keywordId,
    date: p.date,
    device: p.device,
    run_id: p.runId,
    task_id: p.taskId,
    our_pos: ours.pos,
    our_abs: ours.abs ?? null,
    our_url: ours.url,
    our_pack_pos: ours.pack,
    also_ours: ours.also ?? null,
    aio_present: parsed.aio.present,
    aio_cited: parsed.aio.cited,
    features: parsed.features,
    poisoned_restored: restored,
    organic_count: parsed.organic.length,
    resolved_count: parsed.organic.filter((x) => x.domain).length,
    error: null,
  });
  await db.from('seo_serp_item').delete().eq('keyword_id', p.keywordId).eq('date', p.date).eq('device', p.device);
  const rows = [
    ...parsed.organic.map((x) => ({ type: 'organic', pos: x.pos, rank_absolute: x.rankAbsolute ?? null, domain: x.domain || null, url: x.url || null, title: x.title, resolved_by: x.resolvedBy ?? null })),
    ...parsed.localPack.map((x) => ({ type: 'local_pack', pos: x.pos, rank_absolute: null, domain: x.domain || null, url: null, title: x.title, resolved_by: null })),
  ];
  // DataForSEO can repeat a rank_group (two results sharing a slot): keep the first.
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(`${r.type}:${r.pos}`) ? false : (seen.add(`${r.type}:${r.pos}`), true)));
  if (unique.length) await db.from('seo_serp_item').insert(unique.map((r) => ({ keyword_id: p.keywordId, date: p.date, device: p.device, ...r })));
}

/** When every task of a run is in (or has given up), close it: totals, the old-dashboard snapshot, alerts. */
export async function finishIfComplete(runId: number, db: Db = createAdminClient()): Promise<boolean> {
  const { data: run } = await db.from('seo_serp_run').select('*').eq('id', runId).maybeSingle();
  if (!run || run.status === 'done' || run.status === 'failed') return false;
  const { data: jobs } = await db.from('seo_job').select('status').eq('kind', 'serp_collect').eq('payload->>runId', String(runId));
  const done = (jobs ?? []).filter((j) => j.status === 'done').length;
  const failedJobs = (jobs ?? []).filter((j) => j.status === 'failed').length;
  const open = (jobs ?? []).length - done - failedJobs;
  await db.from('seo_serp_run').update({ tasks_done: done, tasks_failed: Number(run.tasks) - done - open }).eq('id', runId);
  if (open > 0) return false;
  await db.from('seo_serp_run').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', runId);
  if (run.device === 'mobile') {
    await writeLegacySnapshot(run.run_date as string, Number(run.cost_usd ?? 0), db).catch((e) => console.error('SEO legacy snapshot failed', e));
    await raiseRankAlerts(run.run_date as string, db).catch((e) => console.error('SEO rank alerts failed', e));
    // The old dashboard's competitor write-up (replaced by the M2 teardown in phase 2).
    await db.from('seo_job').upsert({ kind: 'competitors', dedupe_key: `competitors:${run.run_date}`, payload: { runId } }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  }
  await clearAction('budget', `run:${runId}`, db);
  return true;
}

/** The run in the old cms_kv shape, so /admin/analytics/seo keeps working until Search replaces it. */
async function writeLegacySnapshot(date: string, costUsd: number, db: Db) {
  const [{ data: results }, { data: items }, { data: kws }] = await Promise.all([
    db.from('seo_serp_result').select('*').eq('date', date).eq('device', 'mobile'),
    db.from('seo_serp_item').select('keyword_id, pos, rank_absolute, type, domain, url, title, resolved_by').eq('date', date).eq('device', 'mobile').limit(50000),
    db.from('seo_keyword').select('id, phrase, town, location_name, legacy_id'),
  ]);
  const kw = new Map((kws ?? []).map((k) => [k.id as number, k]));
  const byKw = new Map<number, NonNullable<typeof items>>();
  for (const it of items ?? []) byKw.set(it.keyword_id as number, [...(byKw.get(it.keyword_id as number) ?? []), it]);
  const out: SerpResult[] = (results ?? []).map((r) => {
    const k = kw.get(r.keyword_id as number);
    const its = byKw.get(r.keyword_id as number) ?? [];
    return {
      keywordId: (k?.legacy_id as number | null) ?? (r.keyword_id as number),
      keyword: String(k?.phrase ?? ''),
      town: String(k?.town ?? ''),
      location: String(k?.location_name ?? ''),
      organic: its.filter((i) => i.type === 'organic').sort((a, b) => a.pos - b.pos).map((i) => ({ pos: i.pos, domain: i.domain ?? '', url: i.url ?? '', title: i.title ?? '', rankAbsolute: i.rank_absolute ?? undefined })),
      localPack: its.filter((i) => i.type === 'local_pack').sort((a, b) => a.pos - b.pos).map((i) => ({ pos: i.pos, title: i.title ?? '', domain: i.domain ?? '' })),
      ours: { pos: r.our_pos, url: r.our_url, pack: r.our_pack_pos, abs: r.our_abs },
      features: r.features ?? [],
      aio: { present: !!r.aio_present, cited: !!r.aio_cited },
      ...(r.error ? { error: String(r.error) } : {}),
    };
  });
  const snap: SerpSnapshot = { id: date, at: new Date().toISOString(), costUsd: Math.round(costUsd * 10000) / 10000, results: out };
  await db.from('cms_kv').upsert({ key: `seo-serp:${date}`, value: toKv(snap), updated_at: new Date().toISOString() });
}

/** A priority-1 search that fell 5 or more places, or left the map pack, goes to Needs you; recoveries close it. */
async function raiseRankAlerts(date: string, db: Db) {
  const alerts = await getSetting('alerts', db);
  const { data: kws } = await db.from('seo_keyword').select('id, phrase, town').eq('priority', 1).eq('active', true);
  for (const k of kws ?? []) {
    const { data: rows } = await db.from('seo_serp_result').select('date, our_pos, our_pack_pos, error').eq('keyword_id', k.id).eq('device', 'mobile').lte('date', date).order('date', { ascending: false }).limit(2);
    const [now, before] = rows ?? [];
    if (!now || !before || now.error || before.error) continue;
    const label = `${k.phrase}${k.town && !String(k.phrase).includes(k.town) ? ` (${k.town})` : ''}`;
    const fell = (now.our_pos ?? 101) - (before.our_pos ?? 101);
    if (before.our_pos !== null && fell >= alerts.rankDropPlaces) {
      await raiseAction({ kind: 'rank_drop', ref: `kw:${k.id}`, title: `“${label}” fell ${now.our_pos === null ? 'out of the top 100' : `${fell} places to ${now.our_pos}`}`, why: `Was ${before.our_pos} last run.`, fixHref: `/admin/search/rankings?k=${k.id}` }, db);
    } else if (before.our_pack_pos !== null && now.our_pack_pos === null) {
      await raiseAction({ kind: 'rank_drop', ref: `kw:${k.id}`, title: `We left the map pack for “${label}”`, why: `Was ${before.our_pack_pos} in the map pack last run.`, fixHref: `/admin/search/rankings?k=${k.id}` }, db);
    } else if (now.our_pos !== null && (before.our_pos === null || now.our_pos <= before.our_pos)) {
      await clearAction('rank_drop', `kw:${k.id}`, db);
    }
  }
}

/* ── Check now: one search, live (once a day per search) ───────────────────────────────────────────────────────── */

export const LIVE_CHECK_COST = PRICE.serpLivePage * 10;

export async function liveCheck(keywordId: number, by: string, db: Db = createAdminClient()): Promise<void> {
  const { data: k } = await db.from('seo_keyword').select('id, phrase, town, location_code, location_name, priority, legacy_id, devices').eq('id', keywordId).maybeSingle();
  if (!k) throw new Error('No such search.');
  const { data: recent } = await db.from('seo_serp_run').select('id').eq('kind', 'live').eq('started_by', `${by}:${keywordId}`).gte('started_at', new Date(Date.now() - 86_400_000).toISOString()).limit(1);
  if (recent?.length) throw new Error('This search was checked in the last 24 hours.');
  await checkCap(LIVE_CHECK_COST, {}, db);
  const [kw] = await withLocations([k as Keyword], db);
  const { data: run } = await db.from('seo_serp_run').insert({ kind: 'live', device: 'mobile', run_date: ukDay(), status: 'waiting', tasks: 1, started_by: `${by}:${keywordId}` }).select('id').single();
  const runId = run!.id as number;
  try {
    const { tasks, cost } = await dfs(
      '/serp/google/organic/live/advanced',
      [{ keyword: kw.phrase, location_code: kw.location_code ?? 2826, language_code: 'en', device: 'mobile', os: 'android', depth: 100, resolve_goto_urls: true }],
      { module: 'm1', timeoutMs: 120_000 },
    );
    const task = tasks[0];
    const result = task?.result?.[0] as Record<string, unknown> | undefined;
    if (!task || task.status_code !== 20000) throw new Error(task?.status_message ?? 'No result');
    const p = { runId, keywordId, device: 'mobile' as const, taskId: task.id, date: ukDay() };
    await saveRaw(p.date, task.id, task, db);
    await writeResult(p, (result?.items as unknown[]) ?? [], result ?? {}, db);
    await db.from('seo_serp_run').update({ status: 'done', finished_at: new Date().toISOString(), tasks_done: 1, cost_usd: cost }).eq('id', runId);
  } catch (e) {
    await db.from('seo_serp_run').update({ status: 'failed', finished_at: new Date().toISOString(), error: e instanceof Error ? e.message : 'Failed' }).eq('id', runId);
    throw e;
  }
}

/* ── Fallback when pingbacks don't arrive: ask which tasks are ready ───────────────────────────────────────────── */

export async function readyTaskIds(): Promise<string[]> {
  const { tasks } = await dfs('/serp/google/organic/tasks_ready', undefined, { module: 'm1', log: false });
  return (tasks[0]?.result ?? []).map((r) => String((r as { id?: string }).id ?? '')).filter(Boolean);
}
