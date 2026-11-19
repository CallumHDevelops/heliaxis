'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSearch } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { runAiSamplingStep, startAiSampling } from '@/lib/search/ai/sampler';
import { checkCrawlers } from '@/lib/search/ai/crawlers';
import { cleanPrompt, type ProposedPrompt } from '@/lib/search/ai/prompts';
import { parseUpload, type UploadSource } from '@/lib/search/ai/uploads';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });
const PATH = '/admin/search/ai';

/* ── Runs ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Open this month's run now (admins), then ask the first batch straight away. The dispatcher carries on from there. */
export async function startRunAction(opts: { override?: boolean; again?: boolean } = {}): Promise<Result> {
  try {
    const s = await requireSearch('spend');
    const r = await startAiSampling(createAdminClient(), { override: !!opts.override && can.overrideCap(s.role), again: !!opts.again });
    if (!r.started) return { ok: false, error: r.reason ?? 'Did not start.' };
    const step = await runAiSamplingStep(createAdminClient(), { until: Date.now() + 150_000 });
    revalidatePath(PATH);
    return { ok: true, message: step.remaining < 0 ? (step.note ?? 'Already working.') : step.done ? 'Run finished.' : `Started: ${step.answered ?? 0} answers in, ${step.remaining} to go. The rest are asked every 10 minutes.` };
  } catch (e) {
    return fail(e);
  }
}

/** Ask the next batch now instead of waiting for the dispatcher. */
export async function stepNowAction(): Promise<Result> {
  try {
    await requireSearch('spend');
    const step = await runAiSamplingStep(createAdminClient(), { until: Date.now() + 150_000 });
    revalidatePath(PATH);
    return { ok: true, message: step.remaining < 0 ? (step.note ?? 'Already working.') : step.done ? `Run finished.${step.note ? ` ${step.note}.` : ''}` : `${step.answered ?? 0} more answers in, ${step.remaining} to go.` };
  } catch (e) {
    return fail(e);
  }
}

/* ── Questions ─────────────────────────────────────────────────────────────────────────────────────────────────── */

const KINDS = ['local', 'consideration'] as const;
const short = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;

export async function addPromptAction(p: { prompt: string; kind: string; town?: string; service?: string }): Promise<Result> {
  try {
    await requireSearch('draft');
    const prompt = cleanPrompt(p.prompt);
    if (!prompt) return { ok: false, error: 'Write a question of 8 to 300 characters.' };
    const kind = KINDS.includes(p.kind as never) ? p.kind : 'local';
    const { error } = await createAdminClient().from('ai_prompt').insert({ prompt, kind, town: short(p.town), service: short(p.service) });
    if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'That question is already on the list.' : error.message };
    revalidatePath(PATH);
    return { ok: true, message: 'Added.' };
  } catch (e) {
    return fail(e);
  }
}

/** Accept proposed questions (from the generator) in one go. */
export async function acceptProposalsAction(items: ProposedPrompt[]): Promise<Result> {
  try {
    await requireSearch('draft');
    const rows = items
      .slice(0, 100)
      .map((p) => ({ prompt: cleanPrompt(p.prompt), kind: KINDS.includes(p.kind) ? p.kind : 'local', town: short(p.town), service: short(p.service) }))
      .filter((r) => r.prompt);
    if (!rows.length) return { ok: false, error: 'Nothing to add.' };
    const { error } = await createAdminClient().from('ai_prompt').upsert(rows, { onConflict: 'prompt', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
    return { ok: true, message: `Added ${rows.length}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePromptAction(id: number, patch: { prompt?: string; kind?: string; town?: string | null; service?: string | null; active?: boolean }): Promise<Result> {
  try {
    await requireSearch('draft');
    const row: Record<string, unknown> = {};
    if (patch.prompt !== undefined) {
      const p = cleanPrompt(patch.prompt);
      if (!p) return { ok: false, error: 'Write a question of 8 to 300 characters.' };
      row.prompt = p;
    }
    if (patch.kind !== undefined) row.kind = KINDS.includes(patch.kind as never) ? patch.kind : 'local';
    if (patch.town !== undefined) row.town = short(patch.town);
    if (patch.service !== undefined) row.service = short(patch.service);
    if (patch.active !== undefined) row.active = !!patch.active;
    const { error } = await createAdminClient().from('ai_prompt').update(row).eq('id', id);
    if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'That question is already on the list.' : error.message };
    revalidatePath(PATH);
    return { ok: true, message: 'Saved.' };
  } catch (e) {
    return fail(e);
  }
}

/** Remove a question. One with answers is only switched off, so its history stays. */
export async function removePromptAction(id: number): Promise<Result> {
  try {
    await requireSearch('draft');
    const db = createAdminClient();
    const { count } = await db.from('ai_answer').select('id', { count: 'exact', head: true }).eq('prompt_id', id);
    const { error } = count ? await db.from('ai_prompt').update({ active: false }).eq('id', id) : await db.from('ai_prompt').delete().eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
    return { ok: true, message: count ? 'It has answers, so it was switched off rather than deleted.' : 'Removed.' };
  } catch (e) {
    return fail(e);
  }
}

/* ── Uploads ───────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Save one CSV export. `month` (YYYY-MM) is used when the file has no dates; a new upload replaces one for the same period. */
export async function uploadCsvAction(source: UploadSource, text: string, month?: string): Promise<Result> {
  try {
    const s = await requireSearch('draft');
    if (source !== 'gsc_genai' && source !== 'bing_ai') return { ok: false, error: 'Unknown report.' };
    if (text.length > 8_000_000) return { ok: false, error: 'That file is too big (over 8 MB). Export a shorter date range.' };
    const u = parseUpload(source, text);
    if (!u.rows.length) return { ok: false, error: u.warning ?? 'No rows with numbers were found.' };
    const period = u.period ?? (month && /^\d{4}-\d{2}$/.test(month) ? month : null);
    if (!period) return { ok: false, error: 'This file has no dates. Pick the month it covers, then upload it again.' };
    const db = createAdminClient();
    await db.from('ai_upload').delete().eq('source', source).eq('period', period);
    const { error } = await db.from('ai_upload').insert({ source, period, rows: u.rows.slice(0, 20000), uploaded_by: s.name });
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
    return { ok: true, message: `Saved ${u.rows.length} rows for ${period}${u.skipped ? ` (${u.skipped} without numbers skipped)` : ''}.${u.warning ? ` ${u.warning}` : ''}` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUploadAction(id: number): Promise<Result> {
  try {
    await requireSearch('draft');
    const { error } = await createAdminClient().from('ai_upload').delete().eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ── Crawler access ────────────────────────────────────────────────────────────────────────────────────────────── */

export async function checkCrawlersAction(): Promise<({ ok: true } & Awaited<ReturnType<typeof checkCrawlers>>) | { ok: false; error: string }> {
  try {
    await requireSearch('view');
    return { ok: true, ...(await checkCrawlers()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong' };
  }
}
