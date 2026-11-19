'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSearch } from '@/lib/search/server';
import { backfillCandidates } from '@/lib/search/leads/funnel';
import { confirmedChanges, type BackfillChange } from '@/lib/search/leads/aggregate';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' });

/** Which older rows the channel backfill would label, and why. Changes nothing. */
export async function previewBackfill(): Promise<Result<BackfillChange[]>> {
  try {
    await requireSearch('spend');
    return { ok: true, data: await backfillCandidates() };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Labels the rows the admin saw in the preview, and only those still unlabelled with the same answer now. A row with
 * a channel is never overwritten (the update also requires channel is null).
 */
export async function applyBackfill(seen: { table: string; id: string; channel: string }[]): Promise<Result<{ updated: number; skipped: number }>> {
  try {
    await requireSearch('spend');
    if (!Array.isArray(seen) || !seen.length) return { ok: false, error: 'Nothing to label: run the preview first.' };
    const db = createAdminClient();
    const changes = confirmedChanges(await backfillCandidates(db), seen.slice(0, 25000));
    let updated = 0;
    const groups = new Map<string, BackfillChange[]>();
    for (const c of changes) groups.set(`${c.table}|${c.channel}`, [...(groups.get(`${c.table}|${c.channel}`) ?? []), c]);
    for (const [key, list] of groups) {
      const [table, channel] = key.split('|');
      for (let i = 0; i < list.length; i += 150) {
        const ids = list.slice(i, i + 150).map((c) => c.id);
        const { data, error } = await db.from(table).update({ channel }).in('id', ids).is('channel', null).select('id');
        if (error) throw new Error(`Could not label ${table}: ${error.message}`);
        updated += data?.length ?? 0;
      }
    }
    revalidatePath('/admin/search/leads');
    return { ok: true, data: { updated, skipped: seen.length - updated } };
  } catch (e) {
    return fail(e);
  }
}
