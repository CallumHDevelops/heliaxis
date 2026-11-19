import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfs, dfsConfigured } from '@/lib/dataforseo/client';
import { OUR_DOMAIN } from '@/lib/seo/rankings';
import { ukDay } from '@/lib/seo/serp';
import { checkCap } from './server';

/**
 * Every keyword Google already ranks heliaxis.co.uk for, tracked or not (DataForSEO Labs ranked_keywords, UK). Labs data
 * lags and is an estimate, and is labelled so on screen. Feeds M1's "Untracked wins".
 */

type Db = ReturnType<typeof createAdminClient>;

/** Labs charges per task plus per row; 1,000 rows is a generous ceiling for a site our size. */
const LABS_ESTIMATE = 0.11;

export async function importRankedKeywords(db: Db = createAdminClient()): Promise<{ rows: number }> {
  if (!dfsConfigured()) return { rows: 0 };
  await checkCap(LABS_ESTIMATE, {}, db);
  const { tasks } = await dfs(
    '/dataforseo_labs/google/ranked_keywords/live',
    [{ target: OUR_DOMAIN, location_code: 2826, language_code: 'en', limit: 1000, load_rank_absolute: true }],
    { module: 'm1', timeoutMs: 90_000 },
  );
  const task = tasks[0];
  if (!task || task.status_code !== 20000) throw new Error(task?.status_message ?? 'Labs returned nothing');
  const items = ((task.result?.[0] as { items?: Record<string, unknown>[] } | undefined)?.items ?? []) as Record<string, unknown>[];
  const date = ukDay();
  const rows = items
    .map((it) => {
      const kd = it.keyword_data as { keyword?: string; keyword_info?: { search_volume?: number } } | undefined;
      const se = (it.ranked_serp_element as { serp_item?: { rank_group?: number; url?: string; etv?: number }; serp_item_types?: string[] } | undefined) ?? {};
      return {
        date,
        keyword: String(kd?.keyword ?? ''),
        pos: se.serp_item?.rank_group ?? null,
        url: se.serp_item?.url ?? null,
        volume: kd?.keyword_info?.search_volume ?? null,
        etv: se.serp_item?.etv ?? null,
        serp_features: se.serp_item_types ?? [],
      };
    })
    .filter((r) => r.keyword);
  await db.from('seo_ranked_keyword').delete().eq('date', date);
  for (let i = 0; i < rows.length; i += 500) await db.from('seo_ranked_keyword').upsert(rows.slice(i, i + 500), { onConflict: 'date,keyword' });
  return { rows: rows.length };
}
