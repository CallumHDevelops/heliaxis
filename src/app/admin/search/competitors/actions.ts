'use server';

import { revalidatePath } from 'next/cache';
import { requireSearch } from '@/lib/search/server';
import { estimateRebuild, rebuildTeardown } from '@/lib/search/teardown/server';

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });

/** What rebuilding one search's teardown would cost, shown before anything is spent. */
export async function estimateTeardownAction(keywordId: number): Promise<Result<{ pages: number; dataforseoUsd: number; aiUsd: number }>> {
  try {
    await requireSearch('spend');
    const e = await estimateRebuild(keywordId);
    if (!e.date) return { ok: false, error: 'No rankings run yet, so there is nothing to tear down.' };
    return { ok: true, data: { pages: e.pages, dataforseoUsd: e.dataforseoUsd, aiUsd: e.aiUsd } };
  } catch (e) {
    return fail(e);
  }
}

/** Read any missing pages for one search and rebuild its card and write-up (admin or owner only). */
export async function rebuildTeardownAction(keywordId: number): Promise<Result> {
  try {
    await requireSearch('spend');
    const r = await rebuildTeardown(keywordId);
    revalidatePath('/admin/search/competitors', 'layout');
    return { ok: true, message: `Rebuilt for $${r.costUsd.toFixed(4)}.` };
  } catch (e) {
    return fail(e);
  }
}
