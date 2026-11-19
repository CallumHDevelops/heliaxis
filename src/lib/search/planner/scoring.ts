import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildCandidates, groupCandidates, matchExisting, planGroup, type PlannedCluster, type PoolRow, type TrackedRow } from './plan';
import { getPlannerSettings, latestRunDate, loadProof, refreshFreePool, type Db } from './server';
import { foldPhrase, normaliseUrl, townMatchers } from './words';

/**
 * Weekly opportunity scoring (spec §7: Monday 08:00, free): refresh the free part of the pool, group every search so one
 * page serves each group, map each group to Improve, Create or Hold, score it, and upsert seo_cluster (matched by primary
 * search, so re-scoring never duplicates a page). Owner, status and due date are never touched here.
 */

export type ScoringSummary = { candidates: number; groups: number; updated: number; created: number; stale: number; held: number; skippedNew: number };

type ExistingRow = { id: number; primary_keyword_id: number | null; score_inputs: Record<string, unknown> | null; status: string };

const row = (c: PlannedCluster) => ({
  name: c.name,
  primary_keyword_id: c.primaryKeywordId,
  keywords: c.keywords,
  page_type: c.pageType,
  action: c.action,
  target_page: c.targetPage,
  town: c.town,
  service: c.service,
  score: c.score,
  score_inputs: { ...c.inputs, stale: false, scoredAt: new Date().toISOString() },
  hold_reason: c.holdReason,
  updated_at: new Date().toISOString(),
});

export async function runOpportunityScoring(db: Db = createAdminClient()): Promise<ScoringSummary> {
  const settings = await getPlannerSettings(db);
  await refreshFreePool(settings, db);

  const date = await latestRunDate(db);
  const [poolRes, kwRes, resRes, itemRes, proof, existingRes] = await Promise.all([
    db.from('seo_keyword_pool').select('keyword, source, volume, difficulty, intent, pos, url, rival').limit(20000),
    db.from('seo_keyword').select('id, phrase, town, service, intent, target_page, volume').eq('active', true).limit(5000),
    date ? db.from('seo_serp_result').select('keyword_id, our_pos, our_url').eq('device', 'mobile').eq('date', date).limit(5000) : Promise.resolve({ data: [] }),
    date ? db.from('seo_serp_item').select('keyword_id, pos, url').eq('device', 'mobile').eq('date', date).eq('type', 'organic').lte('pos', 10).limit(20000) : Promise.resolve({ data: [] }),
    loadProof(db),
    db.from('seo_cluster').select('id, primary_keyword_id, score_inputs, status').limit(5000),
  ]);

  const results = new Map(((resRes.data ?? []) as { keyword_id: number; our_pos: number | null; our_url: string | null }[]).map((r) => [r.keyword_id, r]));
  const top10 = new Map<number, string[]>();
  for (const it of (itemRes.data ?? []) as { keyword_id: number; pos: number; url: string | null }[]) {
    const u = normaliseUrl(it.url);
    if (u) top10.set(it.keyword_id, [...(top10.get(it.keyword_id) ?? []), u]);
  }
  type K = { id: number; phrase: string; town: string | null; service: string | null; intent: string; target_page: string | null; volume: number | null };
  const kws = (kwRes.data ?? []) as K[];
  const tracked: TrackedRow[] = kws.map((k) => ({ ...k, our_pos: results.get(k.id)?.our_pos ?? null, our_url: results.get(k.id)?.our_url ?? null, top10: [...new Set(top10.get(k.id) ?? [])] }));

  const towns = [...proof.areas.flatMap((a) => a.towns), ...kws.map((k) => k.town ?? '')];
  const cands = buildCandidates((poolRes.data ?? []) as PoolRow[], tracked, townMatchers(towns));
  const groups = groupCandidates(cands, settings.overlapUrls);
  const planned = groups.map((g) => planGroup(g, settings, proof));

  const existing = (existingRes.data ?? []) as ExistingRow[];
  const match = matchExisting(
    planned.map((p) => ({ key: p.key, primaryKeywordId: p.primaryKeywordId, memberKeys: p.keywords.map((k) => foldPhrase(k.phrase)) })),
    existing.map((e) => ({ id: e.id, key: typeof e.score_inputs?.key === 'string' ? e.score_inputs.key : null, primaryKeywordId: e.primary_keyword_id })),
  );

  let updated = 0;
  const toUpdate = planned.map((p, i) => ({ p, id: match[i] })).filter((x): x is { p: PlannedCluster; id: number } => x.id !== null);
  for (let i = 0; i < toUpdate.length; i += 20) {
    await Promise.all(
      toUpdate.slice(i, i + 20).map(async ({ p, id }) => {
        const { error } = await db.from('seo_cluster').update(row(p)).eq('id', id);
        if (!error) updated++;
      }),
    );
  }

  // New pages: only those worth something (a score above 0), best first, up to the per-run limit.
  const fresh = planned.filter((_, i) => match[i] === null).sort((a, b) => b.score - a.score);
  const adding = fresh.filter((p) => p.score > 0).slice(0, settings.maxNewClusters);
  const ids = new Map<string, number>(toUpdate.map(({ p, id }) => [p.key, id]));
  for (let i = 0; i < adding.length; i += 100) {
    const { data, error } = await db.from('seo_cluster').insert(adding.slice(i, i + 100).map((p) => ({ ...row(p), status: 'idea' }))).select('id, score_inputs');
    if (error) throw new Error(`Queue: ${error.message}`);
    for (const r of (data ?? []) as { id: number; score_inputs: { key?: string } }[]) if (r.score_inputs?.key) ids.set(r.score_inputs.key, r.id);
  }

  // Old ideas no group matches any more: kept (someone may have notes on them) but marked as not in the latest scoring.
  const matched = new Set(match.filter((m): m is number => m !== null));
  const stale = existing.filter((e) => !matched.has(e.id) && e.status === 'idea' && !e.score_inputs?.stale);
  for (const e of stale) await db.from('seo_cluster').update({ score_inputs: { ...(e.score_inputs ?? {}), stale: true } }).eq('id', e.id);

  // Tracked searches point at the group that now covers them.
  const byCluster = new Map<number, number[]>();
  for (const p of planned) {
    const id = ids.get(p.key);
    if (!id) continue;
    for (const k of p.keywords) if (k.keyword_id !== null) byCluster.set(id, [...(byCluster.get(id) ?? []), k.keyword_id]);
  }
  for (const [id, kwIds] of byCluster) await db.from('seo_keyword').update({ cluster_id: id }).in('id', kwIds);

  return {
    candidates: cands.length,
    groups: groups.length,
    updated,
    created: adding.length,
    stale: stale.length,
    held: planned.filter((p) => p.action === 'hold').length,
    skippedNew: fresh.length - adding.length,
  };
}
