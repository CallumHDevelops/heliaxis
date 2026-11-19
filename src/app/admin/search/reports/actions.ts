'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSearch } from '@/lib/search/server';
import { buildWeeklyReport } from '@/lib/search/reports';
import { buildCustomReport, buildMonthlyReport, readReport, rebuildCustomReport, sendReport } from '@/lib/search/reporting/server';
import { ALL_SECTIONS, type CustomView, type Section } from '@/lib/search/reporting/shape';

type Result = { ok: true; message?: string; id?: number } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });
const PERIODS = ['this_week', 'last_week', 'last_4_weeks', 'this_month', 'last_month', 'quarter', 'custom'] as const;

/** Build last week's report (provisional) or last month's Growth Report now. A final report stays frozen. */
export async function buildNow(kind: 'weekly' | 'monthly'): Promise<Result> {
  try {
    await requireSearch('spend');
    const id = kind === 'weekly' ? await buildWeeklyReport({ status: 'provisional' }) : (await buildMonthlyReport(createAdminClient())).id;
    revalidatePath('/admin/search/reports');
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Save a custom report as a named view. */
export async function saveCustomReport(input: { name: string; periodKey: string; start?: string; end?: string; compare: string; sections: string[]; tier?: number | null; service?: string | null }): Promise<Result> {
  try {
    await requireSearch('draft');
    const view: CustomView = {
      periodKey: (PERIODS as readonly string[]).includes(input.periodKey) ? (input.periodKey as CustomView['periodKey']) : 'last_month',
      ...(input.periodKey === 'custom' ? { start: input.start, end: input.end } : {}),
      compare: input.compare === 'year' ? 'year' : 'previous',
      sections: input.sections.filter((s): s is Section => (ALL_SECTIONS as string[]).includes(s)),
      tier: input.tier && input.tier >= 1 && input.tier <= 3 ? input.tier : null,
      service: input.service?.trim() || null,
    };
    const id = await buildCustomReport({ name: input.name, view });
    revalidatePath('/admin/search/reports');
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Rebuild a report with today's data: a custom view moves its rolling dates on; weekly and monthly use their own builders. */
export async function rebuildReport(id: number): Promise<Result> {
  try {
    await requireSearch('view');
    const r = await readReport(id);
    if (!r) throw new Error('That report is gone.');
    await requireSearch(r.kind === 'custom' ? 'draft' : 'spend');
    if (r.status === 'final' && r.kind !== 'custom') throw new Error('A final report is frozen, so its numbers never shift.');
    const next = r.kind === 'custom' ? await rebuildCustomReport(id) : r.kind === 'monthly' ? (await buildMonthlyReport(createAdminClient())).id : await buildWeeklyReport({ status: 'provisional' });
    revalidatePath('/admin/search/reports');
    return { ok: true, id: next };
  } catch (e) {
    return fail(e);
  }
}

/** Email the report (PDF attached) to the recipients in Settings › Reports and alerts, now. */
export async function emailReport(id: number): Promise<Result> {
  try {
    await requireSearch('spend');
    const r = await sendReport(id, createAdminClient(), { force: true });
    revalidatePath('/admin/search/reports');
    if (!r.sent) return { ok: false, error: 'skipped' in r && r.skipped ? r.skipped : ('errors' in r && r.errors?.[0]) || 'Not sent.' };
    return { ok: true, message: `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.` };
  } catch (e) {
    return fail(e);
  }
}

/** Remove a saved custom view (weekly and monthly reports are kept for the archive). */
export async function deleteCustomReport(id: number): Promise<Result> {
  try {
    await requireSearch('draft');
    const { error } = await createAdminClient().from('seo_report').delete().eq('id', id).eq('kind', 'custom');
    if (error) throw new Error(error.message);
    revalidatePath('/admin/search/reports');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
