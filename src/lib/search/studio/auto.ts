import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearAction, raiseAction } from '@/lib/search/inbox';
import { getSetting } from '@/lib/search/server';
import { weekOf } from '@/lib/search/schedule';
import { councilFor, networkOperator, pickClusters, reviewsFromMentions, type ClusterLite, type MentionLite } from './auto-rules';
import { normaliseProof, packageProof, type PackageRow } from './proof';
import { acceptBrief, contentRules, createContent, getContent, proofGate, submitForReview, writeDraft } from './server';
import { canSubmit } from './checks';
import type { Brief, Checks, Proof } from './types';

/**
 * The weekly auto-draft (Cal, 24 Nov 2026: "auto-draft weekly"). Monday 09:00, after the planner scores:
 *  1. start this week's top planned pages (up to Settings › Content rules' weekly limit): brief built and accepted;
 *  2. fill in the proof items known for certain (network operator, council, package prices, real reviews we hold);
 *  3. anything else the proof pack needs (a real local project, a photo with permission) goes to Needs you;
 *  4. daily, any of these pages whose proof pack is complete is drafted and, when every blocking check passes, sent for
 *     approval. Nothing publishes without an admin.
 */

type Db = ReturnType<typeof createAdminClient>;
export const AUTO_BY = 'Search (weekly auto-draft)';

const proofRef = (id: number) => `proof:${id}`;

export async function runAutoDraftWeekly(db: Db = createAdminClient()): Promise<{ started: number[]; slots: number; note?: string }> {
  const rules = await contentRules(db);
  const limit = Number((rules as { weeklyNewPages?: number }).weeklyNewPages ?? 3);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const { start } = weekOf(today);
  // This week's slots: the weekly limit less pages already started by the auto-draft this week.
  const { count: startedThisWeek } = await db.from('seo_content').select('id', { count: 'exact', head: true }).eq('created_by', AUTO_BY).gte('created_at', `${start}T00:00:00Z`);
  const slots = Math.max(0, limit - (startedThisWeek ?? 0));
  if (!slots) return { started: [], slots: 0, note: 'This week’s pages are already started' };

  const [{ data: clusters }, { data: existing }] = await Promise.all([
    db.from('seo_cluster').select('id, action, status, score, name, hold_reason').neq('status', 'dismissed').limit(2000),
    db.from('seo_content').select('cluster_id').not('cluster_id', 'is', null).neq('status', 'rejected').limit(5000),
  ]);
  const started = new Set(((existing ?? []) as { cluster_id: number }[]).map((r) => r.cluster_id));
  const picks = pickClusters((clusters ?? []) as ClusterLite[], started, slots);
  const ids: number[] = [];
  for (const c of picks) {
    try {
      const id = await createContent({ clusterId: c.id, by: AUTO_BY }, db);
      await acceptBrief(id, db);
      await prefillProof(id, db);
      ids.push(id);
    } catch (e) {
      console.error('Search auto-draft: could not start', c.name, e);
    }
  }
  await runAutoDraftFollowUp(db);
  return { started: ids, slots };
}

/** Fill in what we know for certain; never projects, photos or figures. */
async function prefillProof(id: number, db: Db) {
  const c = await getContent(id, db);
  const brief = c.brief as Brief;
  const t = brief?.target;
  const proof: Proof = normaliseProof(c.proof);
  const areas = await getSetting('areas', db);
  const region = areas.list.find((a) => a.towns.some((x) => x.toLowerCase() === String(t?.town ?? '').toLowerCase()))?.region ?? null;
  if (!proof.dno) proof.dno = networkOperator(t?.town, region);
  if (!proof.council && t?.town) proof.council = councilFor(t.town);
  // Our real prices, exactly as pv_packages holds them, for the services the packages price.
  if (!proof.packages.length && ['solar', 'battery', 'general', '', null, undefined].includes(t?.service)) {
    const { data } = await db
      .from('pv_packages')
      .select('id, name, min_panels, max_panels, panel_watts, usable_kwh, price_inc_vat, active, warranty_panel_yrs, warranty_battery_yrs, warranty_workmanship_yrs')
      .eq('active', true)
      .order('display_order')
      .limit(6);
    const today = new Date().toISOString().slice(0, 10);
    proof.packages = ((data ?? []) as PackageRow[]).map((r) => packageProof(r, today));
  }
  if (!proof.reviews.length) {
    const { data } = await db.from('social_mention').select('kind, platform, rating, text, author_display_name, created_at, is_synthetic, author_is_own').eq('kind', 'review').order('created_at', { ascending: false }).limit(50);
    proof.reviews = reviewsFromMentions((data ?? []) as MentionLite[]);
  }
  proof.updatedAt = new Date().toISOString();
  proof.updatedBy = AUTO_BY;
  const { error } = await db.from('seo_content').update({ proof, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Daily (and right after the weekly start): each auto-started page still waiting for its proof pack either asks for
 * what is missing (one Needs you item per page) or, once complete, is drafted and sent for approval.
 */
export async function runAutoDraftFollowUp(db: Db = createAdminClient()): Promise<{ asked: number; drafted: number; inReview: number; errors: string[] }> {
  const { data } = await db.from('seo_content').select('id').eq('created_by', AUTO_BY).eq('mode', 'new').in('status', ['proof', 'draft']).limit(50);
  const out = { asked: 0, drafted: 0, inReview: 0, errors: [] as string[] };
  for (const { id } of (data ?? []) as { id: number }[]) {
    try {
      const c = await getContent(id, db);
      if (c.status === 'proof') {
        const gate = await proofGate(c, db);
        if (!gate.ready) {
          await raiseAction(
            {
              kind: 'approval',
              ref: proofRef(id),
              title: `Add proof for “${c.title ?? 'a new page'}”: ${gate.missing.join(', ')}`,
              why: 'Search started this page from the planner. It drafts itself as soon as these are in, then comes to you for approval.',
              fixHref: `/admin/search/content/${id}`,
              dueDays: 5,
            },
            db,
          );
          out.asked++;
          continue;
        }
        await clearAction('approval', proofRef(id), db);
        await writeDraft(id, AUTO_BY, {}, db);
        out.drafted++;
      }
      // A draft whose blocking checks pass goes for approval; one that fails stays as a draft for a person to fix.
      const now = await getContent(id, db);
      if (now.status === 'draft') {
        const gate = canSubmit(now.status, (now.checks ?? {}) as Checks);
        if (gate.ok) {
          await submitForReview(id, AUTO_BY, db);
          await clearAction('approval', `fix:${id}`, db);
          out.inReview++;
        } else {
          await raiseAction({ kind: 'approval', ref: `fix:${id}`, title: `The draft of “${now.title ?? 'a new page'}” needs fixing`, why: gate.why, fixHref: `/admin/search/content/${id}`, dueDays: 5 }, db);
        }
      }
    } catch (e) {
      out.errors.push(`${id}: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }
  return out;
}
