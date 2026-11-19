'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSearch } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { putPlannerSettings } from '@/lib/search/planner/server';
import { runKeywordResearch, runOpportunityScoring } from '@/lib/search/planner';
import { DEFAULT_PLANNER, PlannerSchema, QUEUE_STATUSES } from '@/lib/search/planner/config';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });
const PATH = '/admin/search/plan';

const Patch = z
  .object({
    status: z.enum(QUEUE_STATUSES).optional(),
    owner: z.string().trim().max(80).nullable().optional(),
    due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

/** Change a queued page's owner, status or due date. */
export async function updateCluster(id: number, patch: z.input<typeof Patch>): Promise<Result> {
  try {
    await requireSearch('draft');
    const p = Patch.parse(patch);
    const clean = { ...p, ...(p.owner !== undefined ? { owner: p.owner || null } : {}), updated_at: new Date().toISOString() };
    const { error } = await createAdminClient().from('seo_cluster').update(clean).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Take a page off the queue (re-scoring keeps it dismissed), or put it back as an idea. */
export async function dismissCluster(id: number, restore = false): Promise<Result> {
  try {
    await requireSearch('draft');
    const { error } = await createAdminClient()
      .from('seo_cluster')
      .update({ status: restore ? 'idea' : 'dismissed', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Re-group and re-score now (free: reads only what is stored). */
export async function rescoreNow(): Promise<Result> {
  try {
    await requireSearch('draft');
    const r = await runOpportunityScoring();
    revalidatePath(PATH);
    return { ok: true, message: `${r.groups} groups from ${r.candidates} searches: ${r.updated} updated, ${r.created} added${r.held ? `, ${r.held} on hold` : ''}.` };
  } catch (e) {
    return fail(e);
  }
}

/** Keyword research now (paid Labs calls, checked against the cap first). Runs as many steps as fit; press again to continue. */
export async function researchNow(opts: { override?: boolean } = {}): Promise<Result> {
  try {
    const s = await requireSearch('spend');
    const r = await runKeywordResearch(undefined, { budgetMs: 200_000, override: !!opts.override && can.overrideCap(s.role) });
    revalidatePath(PATH);
    const cost = r.costUsd ? ` Cost $${r.costUsd.toFixed(2)}.` : '';
    return { ok: true, message: r.done ? `This month’s research is done.${cost}${r.note ? ` ${r.note}` : ''}` : `${r.ran.length} steps done, ${r.remaining} left: press again to carry on.${cost}` };
  } catch (e) {
    return fail(e);
  }
}

/** The owner tunes the score weights. */
export async function savePlannerWeights(value: unknown, reset = false): Promise<Result> {
  try {
    const s = await requireSearch('view');
    if (s.role !== 'owner') return { ok: false, error: 'Only the owner can change the planner weights.' };
    if (!reset) {
      const p = PlannerSchema.safeParse(value);
      if (!p.success) {
        const i = p.error.issues[0];
        return { ok: false, error: `Check ${i?.path.join(' ') || 'the values'}: ${i?.message ?? 'not valid'}.` };
      }
    }
    await putPlannerSettings(reset ? DEFAULT_PLANNER : value, s.name);
    revalidatePath(PATH);
    return { ok: true, message: reset ? 'Back to the defaults. Re-score to apply.' : 'Saved. Re-score to apply.' };
  } catch (e) {
    return fail(e);
  }
}
