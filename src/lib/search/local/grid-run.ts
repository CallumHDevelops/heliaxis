import 'server-only';
import { gzipSync } from 'node:zlib';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfs, dfsConfigured, type DfsTask } from '@/lib/dataforseo/client';
import { checkCap, getSetting } from '../server';
import { ukClock } from '../schedule';
import { coordinate, gridEstimate, gridPlan, gridPoints, parseMapsItems, scanSummary, WAITING, type KeywordLike, type PlanRow } from './grid';

/**
 * M5 map grid jobs (spec §5 M5, §7): on the 2nd of the month every Tier 1 area within map-pack reach gets a 5×5 grid,
 * 10 km across, for its 10 most important searches, posted to DataForSEO's Maps standard queue with one
 * `location_coordinate` per point. Each dispatcher tick then collects whatever is ready (task_get) and closes a scan when
 * all 25 points are in. A point's our_rank is 0 while it waits (see WAITING in grid.ts).
 */

type Db = ReturnType<typeof createAdminClient>;
const RAW_BUCKET = 'seo-raw';
/** A point still not back two days after its scan's day began is given up on (left out of the summary). */
const GIVE_UP_MS = 48 * 3_600_000;

export async function gridPlanNow(db: Db = createAdminClient()): Promise<{ plan: PlanRow[]; estimate: ReturnType<typeof gridEstimate> }> {
  const [areas, { data }] = await Promise.all([getSetting('areas', db), db.from('seo_keyword').select('id, phrase, town, intent, priority, volume, active').eq('active', true)]);
  const plan = gridPlan(areas.list, (data ?? []) as KeywordLike[]);
  return { plan, estimate: gridEstimate(plan) };
}

/** Post this month's grids (monthly, 2nd of the month). Already-posted keyword/centre pairs this month are skipped. */
export async function startGridScans(db: Db = createAdminClient(), opts: { override?: boolean; by?: string } = {}): Promise<{ scans: number; tasks: number; costUsd: number; skipped?: string }> {
  if (!dfsConfigured()) return { scans: 0, tasks: 0, costUsd: 0, skipped: 'DataForSEO is not set up' };
  const { plan } = await gridPlanNow(db);
  const month = ukClock().month;
  const today = ukClock().date;

  const { data: done } = await db.from('seo_grid_scan').select('keyword_id, centre').gte('date', `${month}-01`);
  const have = new Set((done ?? []).map((d) => `${d.keyword_id}|${d.centre}`));
  const todo = plan
    .filter((p) => p.reach.grid)
    .map((p) => ({ ...p, keywords: p.keywords.filter((k) => !have.has(`${k.id}|${p.reach.centreName}`)) }))
    .filter((p) => p.keywords.length);
  const est = gridEstimate(todo);
  if (!est.scans) return { scans: 0, tasks: 0, costUsd: 0, skipped: 'Nothing to post: every grid for this month is in, or no Tier 1 area within reach has searches' };
  await checkCap(est.usd, { override: opts.override }, db);

  let scans = 0;
  let tasks = 0;
  let cost = 0;
  for (const p of todo) {
    if (!p.reach.grid) continue;
    const { centre, centreName } = p.reach;
    const points = gridPoints(centre, 5, 10);
    for (const k of p.keywords) {
      const { data: scan, error } = await db
        .from('seo_grid_scan')
        .insert({ keyword_id: k.id, phrase: k.phrase, centre: centreName, centre_lat: centre.lat, centre_lng: centre.lng, size: 5, radius_km: 5, date: today, status: 'waiting' })
        .select('id')
        .single();
      if (error || !scan) throw new Error(error?.message ?? 'Could not save the scan');
      const scanId = scan.id as number;
      let posted: DfsTask[] = [];
      try {
        const r = await dfs(
          '/serp/google/maps/task_post',
          points.map((pt, i) => ({
            keyword: k.phrase,
            location_coordinate: coordinate(pt),
            language_code: 'en',
            device: 'mobile',
            os: 'android',
            depth: 20,
            tag: `grid:${scanId}:${i}`,
          })),
          { module: 'm5' },
        );
        posted = r.tasks;
        cost += r.cost;
        await db.from('seo_grid_scan').update({ cost_usd: r.cost }).eq('id', scanId);
      } catch (e) {
        await db.from('seo_grid_scan').update({ status: 'failed' }).eq('id', scanId);
        throw e;
      }
      const rows = points.map((pt, i) => {
        const t = posted[i];
        const ok = t && (t.status_code === 20100 || t.status_code === 20000);
        // Not accepted: no task id, so it is left out of the summary.
        return { scan_id: scanId, lat: pt.lat, lng: pt.lng, task_id: ok ? t.id : null, our_rank: ok ? WAITING : null, top3: [] };
      });
      await db.from('seo_grid_point').insert(rows);
      if (!rows.some((r) => r.task_id)) await db.from('seo_grid_scan').update({ status: 'failed' }).eq('id', scanId);
      scans++;
      tasks += rows.filter((r) => r.task_id).length;
    }
  }
  return { scans, tasks, costUsd: Math.round(cost * 10000) / 10000 };
}

async function readyIds(): Promise<Set<string> | null> {
  try {
    const { tasks } = await dfs('/serp/google/maps/tasks_ready', undefined, { module: 'm5', timeoutMs: 20_000, log: false });
    const ids = new Set<string>();
    for (const t of tasks) for (const r of (t.result ?? []) as { id?: string }[]) if (r.id) ids.add(r.id);
    return ids;
  } catch {
    return null;
  }
}

type PointRow = { scan_id: number; lat: number; lng: number; task_id: string | null; our_rank: number | null };

/** Collect ready points (each tick while any scan is waiting) and close finished scans. */
export async function collectGridScans(db: Db = createAdminClient(), opts: { until?: number } = {}): Promise<{ collected: number; closed: number; waiting: number }> {
  const until = opts.until ?? Date.now() + 120_000;
  const { data: scans } = await db.from('seo_grid_scan').select('id, date, status').eq('status', 'waiting').order('id').limit(200);
  if (!scans?.length) return { collected: 0, closed: 0, waiting: 0 };
  if (!dfsConfigured()) return { collected: 0, closed: 0, waiting: scans.length };

  const ids = scans.map((s) => s.id as number);
  const { data: pts } = await db.from('seo_grid_point').select('scan_id, lat, lng, task_id, our_rank').in('scan_id', ids).eq('our_rank', WAITING).limit(5000);
  const pending = (pts ?? []) as PointRow[];
  const ready = pending.length ? await readyIds() : null;
  const today = ukClock().date;
  const scanDate = new Map(scans.map((s) => [s.id as number, String(s.date)]));
  // tasks_ready lists what is waiting to be collected. Ask directly when it can't be read, or for a scan posted before
  // today (a task collected once but not saved no longer shows as ready).
  const due = pending.filter((p) => p.task_id && (!ready || ready.has(p.task_id) || (scanDate.get(p.scan_id) ?? today) < today));
  let collected = 0;
  for (let i = 0; i < due.length && Date.now() < until; i += 10) {
    const batch = due.slice(i, i + 10);
    const got = await Promise.all(batch.map((p) => collectPoint(p, db).catch(() => false)));
    collected += got.filter(Boolean).length;
  }

  // Give up on points that never came back.
  for (const s of scans) {
    if (Date.now() - new Date(`${s.date}T00:00:00Z`).getTime() > GIVE_UP_MS) {
      await db.from('seo_grid_point').update({ our_rank: null, task_id: null }).eq('scan_id', s.id).eq('our_rank', WAITING);
    }
  }

  let closed = 0;
  for (const id of ids) if (await closeIfComplete(id, db)) closed++;
  return { collected, closed, waiting: ids.length - closed };
}

async function collectPoint(p: PointRow, db: Db): Promise<boolean> {
  const { tasks } = await dfs(`/serp/google/maps/task_get/advanced/${p.task_id}`, undefined, { module: 'm5', timeoutMs: 30_000, log: false });
  const task = tasks[0];
  if (!task || task.status_code === 40601 || task.status_code === 40602 || task.status_code === 40100) return false;
  const result = task.result?.[0] as Record<string, unknown> | undefined;
  const items = (result?.items as unknown[] | undefined) ?? [];
  const where = db.from('seo_grid_point');
  if (task.status_code !== 20000) {
    // DataForSEO could not run it: leave it out of the summary.
    await where.update({ our_rank: null, task_id: null, top3: [{ error: task.status_message || 'No result' }] }).eq('scan_id', p.scan_id).eq('lat', p.lat).eq('lng', p.lng);
    return true;
  }
  try {
    await db.storage.from(RAW_BUCKET).upload(`${ukClock().date}/${p.task_id}.json.gz`, gzipSync(Buffer.from(JSON.stringify(task))), { contentType: 'application/gzip', upsert: true });
  } catch {
    /* the raw copy is a convenience */
  }
  const parsed = parseMapsItems(items);
  await where.update({ our_rank: parsed.ourRank, top3: parsed.top3 }).eq('scan_id', p.scan_id).eq('lat', p.lat).eq('lng', p.lng);
  return true;
}

async function closeIfComplete(scanId: number, db: Db): Promise<boolean> {
  const { data } = await db.from('seo_grid_point').select('our_rank, task_id').eq('scan_id', scanId);
  const pts = (data ?? []) as { our_rank: number | null; task_id: string | null }[];
  const s = scanSummary(pts);
  if (s.waiting > 0) return false;
  await db
    .from('seo_grid_scan')
    .update({ status: s.checked ? 'done' : 'failed', avg_rank: s.avgRank, top3_share: s.top3Share })
    .eq('id', scanId);
  return true;
}
