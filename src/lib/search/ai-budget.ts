import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { aiSpendThisMonthGbp } from '@/lib/social/competitors/geo-run';
import { loadAssumptions } from '@/lib/social/assumptions';
import { aiCapMessage } from './ai-cap';

/**
 * The monthly AI cap for Search's own model calls (the studio's draft writer, the teardown write-up). The cap is the
 * one the AI-assistant run uses (Social › Costs, ai_monthly_cap_gbp), read the same way as aiSpendThisMonthGbp in
 * src/lib/social/competitors/geo-run.ts. The spend counted against it is that run's spend plus every ai_usage row
 * Search made: features seo_teardown and seo_content, and the studio's writer calls (ref "seo_content:<id>:…").
 */

type Db = ReturnType<typeof createAdminClient>;

const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();

export async function searchAiSpendThisMonthGbp(db: Db = createAdminClient()): Promise<{ gbp: number; capGbp: number }> {
  const since = monthStart();
  const [social, a, byFeature, byRef] = await Promise.all([
    aiSpendThisMonthGbp(),
    loadAssumptions(),
    db.from('ai_usage').select('cost_usd').in('feature', ['seo_teardown', 'seo_content']).gte('at', since).limit(20000),
    // The writers log under their own features (cms_page, blog); the studio tags its calls with this ref.
    db.from('ai_usage').select('cost_usd').like('ref', 'seo_content:%').not('feature', 'in', '(seo_teardown,seo_content)').gte('at', since).limit(20000),
  ]);
  const usd = [...(byFeature.data ?? []), ...(byRef.data ?? [])].reduce((s, r) => s + Number((r as { cost_usd: number }).cost_usd ?? 0), 0);
  return { gbp: social.gbp + usd * a.usd_to_gbp, capGbp: social.capGbp };
}

/** Throws with a clear message when this month's AI spend has reached the cap. */
export async function assertAiBudget(what: string, db: Db = createAdminClient()): Promise<void> {
  const s = await searchAiSpendThisMonthGbp(db);
  const why = aiCapMessage(what, s.gbp, s.capGbp);
  if (why) throw new Error(why);
}
