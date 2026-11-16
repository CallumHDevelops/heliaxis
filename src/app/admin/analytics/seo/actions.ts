'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { applyProposal, dismissProposal, runWeekly } from '@/lib/seo/server';
import { runCompetitorAnalysis, runRankings, serpConfigured } from '@/lib/seo/serp';

const guard = async () => {
  const s = await requirePortal('analytics');
  if (!s || s.profile.role !== 'admin') throw new Error('Only an admin can do this');
  return s;
};

/** Approve a suggested title and description (as suggested, or as edited on the page): it goes live on the page now. */
export async function approve(id: string, edits: { title?: string; description?: string } = {}): Promise<{ ok: boolean; error?: string }> {
  const s = await guard();
  const r = await applyProposal(id, s.profile.full_name || s.profile.email || 'An admin', edits);
  revalidatePath('/admin/analytics/seo');
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function dismiss(id: string): Promise<{ ok: boolean }> {
  await guard();
  await dismissProposal(id);
  revalidatePath('/admin/analytics/seo');
  return { ok: true };
}

/** Run this week's check now (it takes a minute or two; the page shows it when it's done). */
export async function runNow(): Promise<{ ok: boolean }> {
  await guard();
  after(async () => {
    await runWeekly().catch(() => null);
    revalidatePath('/admin/analytics/seo');
  });
  return { ok: true };
}

/** Check Google positions for every tracked search now, then rerun the competitor analysis (a few minutes; refresh to see it). */
export async function runRankingsNow(): Promise<{ ok: boolean; error?: string }> {
  await guard();
  if (!serpConfigured()) return { ok: false, error: 'DataForSEO isn’t set up yet (DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD).' };
  after(async () => {
    await runRankings().catch(() => null);
    await runCompetitorAnalysis().catch(() => null);
    revalidatePath('/admin/analytics/seo');
  });
  return { ok: true };
}

/** Everything: the site check, then rankings and competitors. */
export async function runAllNow(): Promise<{ ok: boolean }> {
  await guard();
  after(async () => {
    await runWeekly().catch(() => null);
    if (serpConfigured()) {
      await runRankings().catch(() => null);
      await runCompetitorAnalysis().catch(() => null);
    }
    revalidatePath('/admin/analytics/seo');
  });
  return { ok: true };
}
