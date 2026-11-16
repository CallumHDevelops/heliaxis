'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { applyProposal, dismissProposal, runWeekly } from '@/lib/seo/server';
import { readAuditStatus, readRunStatus, runRankingsAndCompetitors, serpConfigured, setAuditStatus } from '@/lib/seo/serp';

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

/** Run the site check now (a minute or two), recording its progress for the dashboard. */
export async function runNow(): Promise<{ ok: boolean }> {
  await guard();
  const startedAt = new Date().toISOString();
  await setAuditStatus({ step: 'running', startedAt, updatedAt: startedAt });
  after(async () => {
    try {
      await runWeekly();
      await setAuditStatus({ step: 'done', startedAt, updatedAt: new Date().toISOString() });
    } catch (e) {
      await setAuditStatus({ step: 'failed', startedAt, updatedAt: new Date().toISOString(), message: e instanceof Error ? e.message : 'Failed' }).catch(() => null);
    }
    revalidatePath('/admin/analytics/seo');
  });
  return { ok: true };
}

/** What is running now, for the progress panel (anyone who can see the dashboard). */
export async function getProgress() {
  const s = await requirePortal('analytics');
  if (!s) throw new Error('Not allowed');
  const [audit, run] = await Promise.all([readAuditStatus().catch(() => null), readRunStatus().catch(() => null)]);
  return { audit, run, serp: serpConfigured() };
}

/** Check Google positions for every tracked search now, then rerun the competitor analysis (a few minutes). Runs on its own, so the site check can't use up its time. */
export async function runRankingsNow(): Promise<{ ok: boolean; error?: string }> {
  await guard();
  if (!serpConfigured()) return { ok: false, error: 'DataForSEO isn’t set up yet (DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD).' };
  after(async () => {
    await runRankingsAndCompetitors();
    revalidatePath('/admin/analytics/seo');
  });
  return { ok: true };
}
