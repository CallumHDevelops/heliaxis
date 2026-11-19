import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { PROJECT_STAGES } from '@/lib/crm/stages';
import { getSetting } from '@/lib/search/server';
import { addDays, ukClock } from '@/lib/search/schedule';
import { PLANNER_KEY, parsePlanner, type PlannerSettings } from './config';
import { strikingDistance, type GscRow } from './parse';
import { countByDistrict, type CrmCounts } from './plan';
import { normalisePhrase } from './words';

/**
 * Planner reads and writes: its own setting (seo_setting key `planner`), proof from the CRM, and the free part of the
 * keyword pool (tracked searches, Labs ranked keywords, Search Console striking distance).
 */

export type Db = ReturnType<typeof createAdminClient>;

export async function getPlannerSettings(db: Db = createAdminClient()): Promise<PlannerSettings> {
  const { data } = await db.from('seo_setting').select('value').eq('key', PLANNER_KEY).maybeSingle();
  return parsePlanner(data?.value);
}

export async function putPlannerSettings(value: unknown, by: string, db: Db = createAdminClient()): Promise<PlannerSettings> {
  const v = parsePlanner(value);
  const { error } = await db.from('seo_setting').upsert({ key: PLANNER_KEY, value: v, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return v;
}

/**
 * Real work by postcode district: projects from Won onwards (crm_projects, falling back to the enquiry's postcode), won
 * enquiries with no project, and completed surveys (shown, but not counted as installs). Plus whether we have any
 * install at all, for pages that are not about one town.
 */
export async function loadProof(db: Db = createAdminClient()): Promise<{ crm: CrmCounts; anyInstall: boolean; areas: Awaited<ReturnType<typeof getSetting<'areas'>>>['list'] }> {
  const [proj, enq, surv, areas] = await Promise.all([
    db.from('crm_projects').select('enquiry_id, postcode, stage, enquiry:enquiries(postcode)').in('stage', PROJECT_STAGES).limit(20000),
    db.from('enquiries').select('id, postcode').eq('status', 'won').limit(20000),
    db.from('crm_surveys').select('status, project:crm_projects(postcode, enquiry:enquiries(postcode))').eq('status', 'complete').limit(20000),
    getSetting('areas', db),
  ]);
  const failed = proj.error ?? enq.error ?? surv.error;
  // A failed read must not turn into "no proof anywhere" and put every town page on hold.
  if (failed) throw new Error(`Reading CRM proof: ${failed.message}`);
  const pc = (v: unknown): string | null => {
    const o = (Array.isArray(v) ? v[0] : v) as { postcode?: string | null } | null | undefined;
    return o?.postcode ?? null;
  };
  type P = { enquiry_id: string; postcode: string | null; enquiry: unknown };
  type S = { project: unknown };
  const projects = (proj.data ?? []) as P[];
  const withProject = new Set(projects.map((p) => p.enquiry_id));
  const rows: { postcode: string | null; kind: 'install' | 'survey' }[] = [
    ...projects.map((p) => ({ postcode: p.postcode || pc(p.enquiry), kind: 'install' as const })),
    ...((enq.data ?? []) as { id: string; postcode: string | null }[]).filter((e) => !withProject.has(e.id)).map((e) => ({ postcode: e.postcode, kind: 'install' as const })),
    ...((surv.data ?? []) as S[]).map((s) => {
      const p = (Array.isArray(s.project) ? s.project[0] : s.project) as { postcode?: string | null; enquiry?: unknown } | null;
      return { postcode: p?.postcode || pc(p?.enquiry), kind: 'survey' as const };
    }),
  ];
  const crm = countByDistrict(rows);
  const anyInstall = Object.values(crm).some((c) => c.installs > 0) || projects.length > 0 || areas.list.some((a) => a.installs === 'yes');
  return { crm, anyInstall, areas: areas.list };
}

/* ── Keyword pool: writes ──────────────────────────────────────────────────────────────────────────────────────── */

export type PoolWrite = { keyword: string; source: 'tracked' | 'ranked' | 'gap' | 'idea' | 'gsc'; volume?: number | null; difficulty?: number | null; intent?: string | null; pos?: number | null; url?: string | null; rival?: string | null };

export async function writePool(rows: PoolWrite[], db: Db): Promise<number> {
  const now = new Date().toISOString();
  const seen = new Map<string, PoolWrite>();
  for (const r of rows) {
    const keyword = normalisePhrase(r.keyword);
    if (keyword) seen.set(`${keyword}|${r.source}`, { ...r, keyword });
  }
  const list = [...seen.values()].map((r) => ({
    keyword: r.keyword,
    source: r.source,
    volume: r.volume ?? null,
    difficulty: r.difficulty ?? null,
    intent: r.intent ?? null,
    pos: r.pos ?? null,
    url: r.url ?? null,
    rival: r.rival ?? null,
    updated_at: now,
  }));
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await db.from('seo_keyword_pool').upsert(list.slice(i, i + 500), { onConflict: 'keyword,source' });
    if (error) throw new Error(`Keyword pool: ${error.message}`);
  }
  return list.length;
}

/** Drop rows of a source that this refresh did not see again. */
async function prune(source: string, before: string, db: Db) {
  await db.from('seo_keyword_pool').delete().eq('source', source).lt('updated_at', before);
}

/** Latest mobile run date with results. */
export async function latestRunDate(db: Db): Promise<string | null> {
  const { data } = await db.from('seo_serp_result').select('date').eq('device', 'mobile').order('date', { ascending: false }).limit(1);
  return (data?.[0]?.date as string | undefined) ?? null;
}

/**
 * The free sources, refreshed before every scoring run: tracked searches with their latest result, Labs ranked keywords
 * (latest pull), and Search Console striking-distance queries over the last 28 days.
 */
export async function refreshFreePool(settings: PlannerSettings, db: Db = createAdminClient()): Promise<{ tracked: number; ranked: number; gsc: number }> {
  const started = new Date(Date.now() - 1000).toISOString();
  const date = await latestRunDate(db);
  const [kws, res, rankedDates] = await Promise.all([
    db.from('seo_keyword').select('id, phrase, intent, volume, target_page').eq('active', true).limit(5000),
    date ? db.from('seo_serp_result').select('keyword_id, our_pos, our_url').eq('device', 'mobile').eq('date', date).limit(5000) : Promise.resolve({ data: [] }),
    db.from('seo_ranked_keyword').select('date').order('date', { ascending: false }).limit(1),
  ]);
  const byId = new Map(((res.data ?? []) as { keyword_id: number; our_pos: number | null; our_url: string | null }[]).map((r) => [r.keyword_id, r]));
  const tracked = await writePool(
    ((kws.data ?? []) as { id: number; phrase: string; intent: string; volume: number | null; target_page: string | null }[]).map((k) => ({
      keyword: k.phrase,
      source: 'tracked' as const,
      volume: k.volume,
      intent: k.intent,
      pos: byId.get(k.id)?.our_pos ?? null,
      url: byId.get(k.id)?.our_url ?? null,
    })),
    db,
  );
  await prune('tracked', started, db);

  let ranked = 0;
  const rankedDate = rankedDates.data?.[0]?.date as string | undefined;
  if (rankedDate) {
    const { data } = await db.from('seo_ranked_keyword').select('keyword, pos, url, volume').eq('date', rankedDate).limit(5000);
    ranked = await writePool(((data ?? []) as { keyword: string; pos: number | null; url: string | null; volume: number | null }[]).map((r) => ({ keyword: r.keyword, source: 'ranked' as const, volume: r.volume, pos: r.pos, url: r.url })), db);
    await prune('ranked', started, db);
  }

  const since = addDays(ukClock().date, -28);
  const rows: GscRow[] = [];
  for (let from = 0; from < 200_000; from += 10_000) {
    const { data } = await db.from('gsc_daily').select('query, page, impressions, position').gte('date', since).neq('query', '').range(from, from + 9_999);
    rows.push(...((data ?? []) as GscRow[]));
    if ((data?.length ?? 0) < 10_000) break;
  }
  const striking = strikingDistance(rows, { from: settings.strikingFrom, to: settings.strikingTo, minImpressions: settings.minImpressions });
  // The volume column holds impressions over the 28 days for Search Console rows (used only when Labs has no volume).
  const gsc = await writePool(striking.map((s) => ({ keyword: s.keyword, source: 'gsc' as const, volume: s.impressions, pos: s.pos, url: s.url })), db);
  await prune('gsc', started, db);

  return { tracked, ranked, gsc };
}
