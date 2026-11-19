import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { raiseAction } from '@/lib/search/inbox';
import { addDaysIso, bestPosition, dueDays, gscTotals, hasMoved, type Measure } from './measure';
import type { Brief } from './types';

/**
 * Content measures (spec §5 M4.6, §7: daily). For each published page: best position across its searches, Search Console
 * impressions and clicks for the page, and enquiries that landed on it, at day 0 (the baseline, recorded on publish) and
 * days 14, 28, 56 and 90. A page that has not moved by day 90 goes back to the planner as Improve and raises a refresh item.
 */

type Db = ReturnType<typeof createAdminClient>;
type Published = { id: number; published_at: string; published_ref: string; brief: Brief | Record<string, never> };

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

export async function computeMeasure(db: Db, c: Published, day: number): Promise<Measure> {
  const pub = c.published_at.slice(0, 10);
  const path = c.published_ref;
  const ids = (c.brief as Brief)?.target?.keywordIds ?? [];
  // Day 0 looks at the two weeks and four weeks before publishing; later days at the window ending on that day.
  const end = day === 0 ? addDaysIso(pub, -1) : addDaysIso(pub, day);
  const posWindow = day === 0 ? 14 : 8;
  const gscDays = day === 0 ? 28 : Math.min(day, 28);
  const gscFrom = addDaysIso(end, -(gscDays - 1));

  const [serp, gsc, enq] = await Promise.all([
    ids.length ? db.from('seo_serp_result').select('date, our_pos').in('keyword_id', ids).gt('date', addDaysIso(end, -posWindow)).lte('date', end).limit(5000) : Promise.resolve({ data: [] }),
    db.from('gsc_daily').select('date, page, clicks, impressions').ilike('page', `%${path}`).gte('date', gscFrom).lte('date', end).limit(50000),
    day === 0
      ? db.from('enquiries').select('id', { count: 'exact', head: true }).eq('landing_path', path).gte('created_at', `${addDaysIso(pub, -28)}T00:00:00Z`).lt('created_at', c.published_at)
      : db.from('enquiries').select('id', { count: 'exact', head: true }).eq('landing_path', path).gte('created_at', c.published_at).lte('created_at', `${end}T23:59:59Z`),
  ]);
  const t = gscTotals((gsc.data ?? []) as { date: string; page: string; clicks: number; impressions: number }[], path, gscFrom, end);
  return {
    day,
    best_pos: bestPosition((serp.data ?? []) as { date: string; our_pos: number | null }[], end, posWindow),
    impressions: t.impressions,
    clicks: t.clicks,
    enquiries: (enq as { count: number | null }).count ?? 0,
  };
}

export async function recordMeasure(db: Db, c: Published, day: number): Promise<Measure> {
  const m = await computeMeasure(db, c, day);
  const { error } = await db.from('seo_content_measure').upsert({ content_id: c.id, ...m, measured_at: new Date().toISOString() }, { onConflict: 'content_id,day' });
  if (error) throw new Error(error.message);
  return m;
}

/** Daily: measures every published page that has reached day 14, 28, 56 or 90 without that measure yet. */
export async function runContentMeasures(db: Db = createAdminClient()): Promise<{ pages: number; measured: number; backToPlanner: number }> {
  const { data } = await db.from('seo_content').select('id, title, kind, cluster_id, published_at, published_ref, brief').eq('status', 'published').not('published_at', 'is', null).limit(1000);
  const rows = (data ?? []) as (Published & { title: string | null; kind: string; cluster_id: number | null })[];
  if (!rows.length) return { pages: 0, measured: 0, backToPlanner: 0 };
  const { data: done } = await db.from('seo_content_measure').select('content_id, day, best_pos, impressions, clicks, enquiries').in('content_id', rows.map((r) => r.id));
  const byId = new Map<number, Measure[]>();
  for (const m of (done ?? []) as (Measure & { content_id: number })[]) byId.set(m.content_id, [...(byId.get(m.content_id) ?? []), m]);
  let measured = 0;
  let back = 0;
  const now = today();
  for (const c of rows) {
    const have = byId.get(c.id) ?? [];
    for (const day of dueDays(c.published_at, have.map((m) => m.day), now)) {
      const m = await recordMeasure(db, c, day);
      measured++;
      if (day === 14 && c.cluster_id) await db.from('seo_cluster').update({ status: 'measuring', updated_at: new Date().toISOString() }).eq('id', c.cluster_id).eq('status', 'published');
      if (day !== 90) continue;
      let base = have.find((x) => x.day === 0);
      if (!base) base = await recordMeasure(db, c, 0);
      if (hasMoved(base, m)) continue;
      back++;
      await backToPlanner(db, c, base, m);
    }
  }
  return { pages: rows.length, measured, backToPlanner: back };
}

async function backToPlanner(db: Db, c: Published & { title: string | null; cluster_id: number | null }, base: Measure, m: Measure) {
  const brief = c.brief as Brief;
  const t = brief?.target;
  const now = new Date().toISOString();
  let clusterId = c.cluster_id;
  if (clusterId) {
    await db.from('seo_cluster').update({ action: 'improve', status: 'idea', target_page: c.published_ref, updated_at: now }).eq('id', clusterId);
  } else if (t) {
    const { data } = await db
      .from('seo_cluster')
      .insert({ name: t.name, primary_keyword_id: t.keywordIds[0] ?? null, keywords: t.phrases.map((phrase) => ({ phrase, keyword_id: phrase === t.primary ? (t.keywordIds[0] ?? null) : null, source: 'tracked' })), page_type: t.pageType, action: 'improve', target_page: c.published_ref, town: t.town, service: t.service, status: 'idea' })
      .select('id')
      .single();
    clusterId = (data as { id: number } | null)?.id ?? null;
    if (clusterId) await db.from('seo_content').update({ cluster_id: clusterId }).eq('id', c.id);
  }
  const pos = (p: number | null) => (p == null ? 'not in the top 100' : `position ${p}`);
  await raiseAction(
    {
      kind: 'refresh',
      ref: `page:${c.published_ref}`,
      title: `Refresh ${c.published_ref}: no movement in 90 days`,
      why: `Best position went from ${pos(base.best_pos)} to ${pos(m.best_pos)}; ${m.impressions ?? 0} impressions in the last 28 days (before publishing: ${base.impressions ?? 0}). It is back in the planner as Improve.`,
      fixHref: `/admin/search/content/new?page=${encodeURIComponent(c.published_ref)}`,
    },
    db,
  );
}
