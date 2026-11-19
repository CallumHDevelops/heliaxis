import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfs, dfsConfigured } from '@/lib/dataforseo/client';
import { OUR_DOMAIN } from '@/lib/seo/rankings';
import { checkCap } from '@/lib/search/server';
import { ukClock } from '@/lib/search/schedule';
import { parseDifficulty, parseIntent, parseLabsItems, topRivals } from './parse';
import { getPlannerSettings, latestRunDate, refreshFreePool, writePool, type Db, type PoolWrite } from './server';
import { estimateOf, ideaSeedsFor, LIMITS, relatedSeedsFor, researchSteps, type Step } from './steps';
import { isRelevantIdea } from './words';

/**
 * Monthly keyword research (spec §5 M3 keyword pool, §7 "Rival gaps, keyword ideas: 1st of month"): the free sources, then
 * rival gaps (domain_intersection against the top 8 rival installers in the latest top 10s), keyword ideas and related
 * keywords (UK, English), then difficulty and intent for anything in the pool without them. Each call does as many steps
 * as fit in its time budget and saves its place, so the dispatcher can call it again until it reports done.
 */

const STATE_KEY = 'planner_research';
const UK = { location_code: 2826, language_code: 'en' } as const;

type StepLog = { at: string; rows?: number; cost?: number; error?: string };
export type ResearchState = { month: string; startedAt: string; rivals: string[]; relatedSeeds: string[]; ideaSeeds: string[]; estimate: number; done: Record<string, StepLog>; finishedAt?: string | null };

export type ResearchSummary = { done: boolean; month: string; ran: string[]; remaining: number; estimateUsd: number; costUsd: number; note?: string };

export async function readResearchState(db: Db = createAdminClient()): Promise<ResearchState | null> {
  const { data } = await db.from('seo_setting').select('value').eq('key', STATE_KEY).maybeSingle();
  const v = data?.value as ResearchState | undefined;
  return v && typeof v === 'object' && v.month ? v : null;
}

async function saveState(s: ResearchState, db: Db) {
  await db.from('seo_setting').upsert({ key: STATE_KEY, value: s, updated_by: 'planner', updated_at: new Date().toISOString() });
}

/** What a fresh run this month would do and cost (for the pre-flight figure on screen). */
export async function planResearch(db: Db = createAdminClient()): Promise<{ rivals: string[]; relatedSeeds: string[]; ideaSeeds: string[]; steps: Step[]; estimate: number }> {
  const date = await latestRunDate(db);
  const [items, kws] = await Promise.all([
    date ? db.from('seo_serp_item').select('domain').eq('device', 'mobile').eq('date', date).eq('type', 'organic').lte('pos', 10).limit(5000) : Promise.resolve({ data: [] }),
    db.from('seo_keyword').select('phrase, service, priority').eq('active', true).order('priority').limit(5000),
  ]);
  const rivals = topRivals((items.data ?? []) as { domain: string | null }[], 8);
  const k = (kws.data ?? []) as { phrase: string; service: string | null; priority: number }[];
  const services = [...new Set(k.map((x) => (x.service === 'heatpump' ? 'heat_pump' : (x.service ?? ''))))];
  const relatedSeeds = relatedSeedsFor(services);
  const ideaSeeds = ideaSeedsFor(services, k.map((x) => x.phrase));
  const steps = researchSteps(rivals, relatedSeeds);
  return { rivals, relatedSeeds, ideaSeeds, steps, estimate: estimateOf(steps) };
}

async function labs(path: string, body: Record<string, unknown>, timeoutMs = 90_000) {
  const { tasks, cost } = await dfs(path, [body], { module: 'm3', timeoutMs });
  const t = tasks[0];
  if (!t || t.status_code !== 20000) throw new Error(t?.status_message ?? 'Labs returned nothing');
  return { result: t.result, cost: Number(t.cost ?? cost ?? 0) };
}

async function runStep(id: string, s: ResearchState, db: Db): Promise<StepLog> {
  const at = new Date().toISOString();
  if (id === 'free') {
    const r = await refreshFreePool(await getPlannerSettings(db), db);
    return { at, rows: r.tracked + r.ranked + r.gsc };
  }
  if (id.startsWith('gap:')) {
    const rival = id.slice(4);
    const { result, cost } = await labs('/dataforseo_labs/google/domain_intersection/live', {
      targets: { '1': rival, '2': OUR_DOMAIN },
      intersections: false,
      ...UK,
      limit: LIMITS.gapRows,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
      filters: [['keyword_data.keyword_info.search_volume', '>', 10]],
    });
    const rows = parseLabsItems(result).filter((r) => isRelevantIdea(r.keyword));
    const n = await writePool(rows.map((r) => ({ keyword: r.keyword, source: 'gap' as const, volume: r.volume, difficulty: r.difficulty, intent: r.intent, pos: r.rivalPos, url: r.rivalUrl, rival })), db);
    return { at, rows: n, cost };
  }
  if (id === 'ideas') {
    const { result, cost } = await labs('/dataforseo_labs/google/keyword_ideas/live', {
      keywords: s.ideaSeeds,
      ...UK,
      limit: LIMITS.ideaRows,
      order_by: ['keyword_info.search_volume,desc'],
      filters: [['keyword_info.search_volume', '>', 10]],
    });
    const rows = parseLabsItems(result).filter((r) => isRelevantIdea(r.keyword));
    const n = await writePool(rows.map((r) => ({ keyword: r.keyword, source: 'idea' as const, volume: r.volume, difficulty: r.difficulty, intent: r.intent })), db);
    return { at, rows: n, cost };
  }
  if (id.startsWith('related:')) {
    const { result, cost } = await labs('/dataforseo_labs/google/related_keywords/live', { keyword: id.slice(8), ...UK, depth: 1, limit: LIMITS.relatedRows });
    const rows = parseLabsItems(result).filter((r) => isRelevantIdea(r.keyword));
    // Upsert, but don't wipe a difficulty or intent that keyword_ideas already gave the same keyword.
    const { data: had } = await db.from('seo_keyword_pool').select('keyword, difficulty, intent').eq('source', 'idea').in('keyword', rows.map((r) => r.keyword).slice(0, 500));
    const prev = new Map(((had ?? []) as { keyword: string; difficulty: number | null; intent: string | null }[]).map((h) => [h.keyword, h]));
    const n = await writePool(rows.map((r) => ({ keyword: r.keyword, source: 'idea' as const, volume: r.volume, difficulty: r.difficulty ?? prev.get(r.keyword)?.difficulty ?? null, intent: r.intent ?? prev.get(r.keyword)?.intent ?? null })), db);
    return { at, rows: n, cost };
  }
  if (id === 'difficulty' || id === 'intent') {
    const col = id === 'difficulty' ? 'difficulty' : 'intent';
    const { data } = await db.from('seo_keyword_pool').select('*').is(col, null).neq('source', 'tracked').order('volume', { ascending: false, nullsFirst: false }).limit(3000);
    const rows = (data ?? []) as { keyword: string; source: string; volume: number | null; difficulty: number | null; intent: string | null; pos: number | null; url: string | null; rival: string | null }[];
    const keywords = [...new Set(rows.map((r) => r.keyword))].slice(0, LIMITS.bulkKeywords);
    if (!keywords.length) return { at, rows: 0, cost: 0 };
    const { result, cost } =
      id === 'difficulty'
        ? await labs('/dataforseo_labs/google/bulk_keyword_difficulty/live', { keywords, ...UK })
        : await labs('/dataforseo_labs/google/search_intent/live', { keywords, language_code: 'en' });
    const kd = id === 'difficulty' ? parseDifficulty(result) : new Map<string, number>();
    const intent = id === 'intent' ? parseIntent(result) : new Map<string, string>();
    const patched = rows
      .filter((r) => kd.has(r.keyword) || intent.has(r.keyword))
      .map((r) => ({ ...r, source: r.source as PoolWrite['source'], difficulty: kd.get(r.keyword) ?? r.difficulty, intent: intent.get(r.keyword) ?? r.intent }));
    const n = await writePool(patched, db);
    return { at, rows: n, cost };
  }
  return { at, error: 'Unknown step' };
}

/**
 * Job handler: monthly on the 1st (after the desktop SERPs). Returns done: false while steps remain; call it again (the
 * dispatcher should treat that as "later"). Paid steps are skipped, with a note, until DataForSEO is connected.
 */
export async function runKeywordResearch(db: Db = createAdminClient(), opts: { budgetMs?: number; override?: boolean } = {}): Promise<ResearchSummary> {
  const until = Date.now() + (opts.budgetMs ?? 60_000);
  const month = ukClock().month;
  let s = await readResearchState(db);
  if (!s || s.month !== month) {
    const p = await planResearch(db);
    s = { month, startedAt: new Date().toISOString(), rivals: p.rivals, relatedSeeds: p.relatedSeeds, ideaSeeds: p.ideaSeeds, estimate: p.estimate, done: {}, finishedAt: null };
    // Pre-flight: the whole month's research against the cap, before the first paid call.
    if (dfsConfigured()) await checkCap(p.estimate, { override: opts.override }, db);
    await saveState(s, db);
  }
  const steps = researchSteps(s.rivals, s.relatedSeeds);
  const ran: string[] = [];
  let cost = 0;
  let note: string | undefined;
  for (const step of steps) {
    if (s.done[step.id]) continue;
    if (Date.now() > until) break;
    if (step.paid && !dfsConfigured()) {
      // Left undone, so the research can carry on this month once DataForSEO is connected.
      note = 'DataForSEO is not connected: only the free sources were refreshed.';
      continue;
    }
    if (step.paid) await checkCap(step.estimate, { override: opts.override }, db);
    try {
      s.done[step.id] = await runStep(step.id, s, db);
    } catch (e) {
      // One failing rival or endpoint must not block the rest of the month's research.
      s.done[step.id] = { at: new Date().toISOString(), error: e instanceof Error ? e.message : 'failed' };
    }
    cost += s.done[step.id].cost ?? 0;
    ran.push(step.id);
    await saveState(s, db);
  }
  const remaining = steps.filter((x) => !s.done[x.id]).length;
  if (!remaining && !s.finishedAt) {
    // Gaps and ideas not seen again this month are out of date, but only when this month's calls for them worked.
    const ok = (prefix: string) => {
      const logs = Object.entries(s.done).filter(([k]) => k === prefix || k.startsWith(`${prefix}:`));
      return logs.length > 0 && logs.every(([, l]) => !l.error);
    };
    const fresh = [...(ok('gap') ? ['gap'] : []), ...(ok('ideas') && ok('related') ? ['idea'] : [])];
    if (fresh.length) await db.from('seo_keyword_pool').delete().in('source', fresh).lt('updated_at', s.startedAt);
    s.finishedAt = new Date().toISOString();
    await saveState(s, db);
  }
  // Without DataForSEO the paid steps can't run: report done so the dispatcher doesn't keep retrying.
  const stuck = !dfsConfigured() && steps.every((x) => s.done[x.id] || x.paid);
  return { done: remaining === 0 || stuck, month, ran, remaining, estimateUsd: s.estimate, costUsd: Math.round(cost * 10000) / 10000, ...(note ? { note } : {}) };
}
