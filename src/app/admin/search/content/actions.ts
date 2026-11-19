'use server';

import { revalidatePath } from 'next/cache';
import { requireSearch } from '@/lib/search/server';
import { acceptBrief, checkContent, createContent, editBrief, editDraft, rebuildBrief, rejectContent, saveProof, sendBack, submitForReview, writeDraft } from '@/lib/search/studio/server';
import { approveAndPublish, recordRefresh } from '@/lib/search/studio/publish';
import type { ContentKind, PageType } from '@/lib/search/studio/types';

type Result = { ok: true; message?: string; id?: number } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });

const refresh = (id?: number) => {
  revalidatePath('/admin/search/content');
  if (id) revalidatePath(`/admin/search/content/${id}`);
  revalidatePath('/admin/search', 'layout');
};

/** Start a page (or a refresh) from a planner group, a tracked search or a live page; the brief is built straight away. */
export async function startContent(opts: { clusterId?: number; keywordId?: number; page?: string; kind?: ContentKind }): Promise<Result> {
  try {
    const s = await requireSearch('draft');
    const id = await createContent({ clusterId: opts.clusterId ?? null, keywordId: opts.keywordId ?? null, page: opts.page ?? null, kind: opts.kind ?? null, by: s.name });
    refresh(id);
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function rebuildBriefAction(id: number): Promise<Result> {
  try {
    await requireSearch('draft');
    await rebuildBrief(id);
    refresh(id);
    return { ok: true, message: 'Brief rebuilt from the latest rows.' };
  } catch (e) {
    return fail(e);
  }
}

export async function editBriefAction(id: number, edit: { outline?: string[]; min?: number; max?: number; kind?: ContentKind; pageType?: PageType }): Promise<Result> {
  try {
    await requireSearch('draft');
    await editBrief(id, edit);
    refresh(id);
    return { ok: true, message: 'Saved.' };
  } catch (e) {
    return fail(e);
  }
}

export async function acceptBriefAction(id: number): Promise<Result> {
  try {
    await requireSearch('draft');
    await acceptBrief(id);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveProofAction(id: number, proof: unknown): Promise<Result> {
  try {
    const s = await requireSearch('draft');
    await saveProof(id, proof, s.name);
    refresh(id);
    return { ok: true, message: 'Proof pack saved.' };
  } catch (e) {
    return fail(e);
  }
}

/** Writes the draft (a minute or two on the strongest model), then runs the checks. */
export async function writeDraftAction(id: number, opts: { fixes?: boolean } = {}): Promise<Result> {
  try {
    const s = await requireSearch('draft');
    const checks = await writeDraft(id, s.name, opts);
    refresh(id);
    const failing = checks.results.filter((r) => r.blocking && !r.ok).length;
    return { ok: true, message: failing ? `Draft written. ${failing} check${failing === 1 ? '' : 's'} to fix.` : 'Draft written. Every blocking check passes.' };
  } catch (e) {
    refresh(id);
    return fail(e);
  }
}

export async function editDraftAction(id: number, edit: { title?: string; description?: string; slug?: string; schema?: string; body?: string }): Promise<Result> {
  try {
    const s = await requireSearch('draft');
    await editDraft(id, edit, s.name);
    refresh(id);
    return { ok: true, message: 'Saved and checked.' };
  } catch (e) {
    return fail(e);
  }
}

export async function runChecksAction(id: number): Promise<Result> {
  try {
    await requireSearch('draft');
    await checkContent(id);
    refresh(id);
    return { ok: true, message: 'Checked.' };
  } catch (e) {
    return fail(e);
  }
}

export async function submitAction(id: number): Promise<Result> {
  try {
    const s = await requireSearch('draft');
    await submitForReview(id, s.name);
    refresh(id);
    return { ok: true, message: 'Sent for approval. It is in Needs you for the admins.' };
  } catch (e) {
    refresh(id);
    return fail(e);
  }
}

/** Admins only (requireSearch('publish')): approve, publish, ping IndexNow, record the day-0 baseline. */
export async function approvePublishAction(id: number): Promise<Result> {
  try {
    const s = await requireSearch('publish');
    const info = await approveAndPublish(id, s);
    refresh(id);
    return { ok: true, message: `Published at ${info.path}. ${info.inSitemap ? 'In the sitemap.' : 'Not in the sitemap snapshot yet.'} IndexNow: ${info.indexNow}` };
  } catch (e) {
    refresh(id);
    return fail(e);
  }
}

export async function sendBackAction(id: number, note: string): Promise<Result> {
  try {
    const s = await requireSearch('publish');
    await sendBack(id, note, s.name);
    refresh(id);
    return { ok: true, message: 'Sent back to the editor.' };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectAction(id: number): Promise<Result> {
  try {
    const s = await requireSearch('publish');
    await rejectContent(id, s.name);
    refresh(id);
    return { ok: true, message: 'Rejected.' };
  } catch (e) {
    return fail(e);
  }
}

export async function recordRefreshAction(id: number): Promise<Result> {
  try {
    const s = await requireSearch('publish');
    const info = await recordRefresh(id, s);
    refresh(id);
    return { ok: true, message: `Refresh recorded for ${info.path}. Measures restart from today. IndexNow: ${info.indexNow}` };
  } catch (e) {
    return fail(e);
  }
}
