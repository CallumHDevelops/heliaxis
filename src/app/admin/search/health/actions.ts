'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSearch } from '@/lib/search/server';
import { clearAction } from '@/lib/search/inbox';
import { applyProposal, dismissProposal, readProposals, runWeekly } from '@/lib/seo/server';
import { setAuditStatus } from '@/lib/seo/serp';
import { runHealthChecks, runIndexChecks } from '@/lib/search/health/server';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });

/** Approve a suggested title and description (as suggested, or as edited here): it goes live on the page now. */
export async function approveProposal(id: string, edits: { title?: string; description?: string } = {}): Promise<Result> {
  try {
    const s = await requireSearch('publish');
    const db = createAdminClient();
    const p = (await readProposals(db)).find((x) => x.id === id);
    const r = await applyProposal(id, s.name, edits, db);
    if (!r.ok) return { ok: false, error: r.error };
    if (p) await clearAction('meta', `meta:${p.path}`, db);
    revalidatePath('/admin/search/health');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function dismissMeta(id: string): Promise<Result> {
  try {
    await requireSearch('draft');
    const db = createAdminClient();
    const p = (await readProposals(db)).find((x) => x.id === id);
    await dismissProposal(id, db);
    if (p) await clearAction('meta', `meta:${p.path}`, db);
    revalidatePath('/admin/search/health');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The free checks now (sitemap, orphans, canonicals, schema, crawlers, llms.txt) and the index check; no paid Lighthouse runs. */
export async function runFreeChecksNow(): Promise<Result> {
  try {
    await requireSearch('spend');
    after(async () => {
      const db = createAdminClient();
      await runHealthChecks(db, { force: true, lighthouse: false }).catch(() => null);
      await runIndexChecks(db).catch(() => null);
      revalidatePath('/admin/search/health');
    });
    return { ok: true, message: 'Running: refresh in a minute or two.' };
  } catch (e) {
    return fail(e);
  }
}

/** The weekly site audit and its meta proposals now (a minute or two). */
export async function runAuditNow(): Promise<Result> {
  try {
    await requireSearch('spend');
    const startedAt = new Date().toISOString();
    await setAuditStatus({ step: 'running', startedAt, updatedAt: startedAt });
    after(async () => {
      try {
        await runWeekly();
        await setAuditStatus({ step: 'done', startedAt, updatedAt: new Date().toISOString() });
      } catch (e) {
        await setAuditStatus({ step: 'failed', startedAt, updatedAt: new Date().toISOString(), message: e instanceof Error ? e.message : 'Failed' }).catch(() => null);
      }
      revalidatePath('/admin/search/health');
    });
    return { ok: true, message: 'The audit is running: refresh in a minute or two.' };
  } catch (e) {
    return fail(e);
  }
}
