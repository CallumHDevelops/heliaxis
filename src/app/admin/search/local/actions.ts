'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSearch } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { startGridScans } from '@/lib/search/local/grid-run';
import { importBusinessProfile } from '@/lib/search/local/gbp';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });
const PATH = '/admin/search/local';

/** Post this month's map grids now (skips any already posted this month). Admin or owner; the owner can pass the cap. */
export async function runGridNow(opts: { override?: boolean } = {}): Promise<Result> {
  try {
    const s = await requireSearch('spend');
    const r = await startGridScans(createAdminClient(), { override: !!opts.override && can.overrideCap(s.role), by: s.name });
    revalidatePath(PATH);
    if (r.skipped) return { ok: false, error: r.skipped };
    return { ok: true, message: `${r.scans} grids posted (${r.tasks} points, $${r.costUsd.toFixed(2)}). Results arrive over the next half hour or so.` };
  } catch (e) {
    return fail(e);
  }
}

/** Pull the Business Profile figures now (free). */
export async function importGbpNow(): Promise<Result> {
  try {
    await requireSearch('spend');
    const r = await importBusinessProfile(createAdminClient());
    revalidatePath(PATH);
    if (!r.connected) return { ok: false, error: `Not connected: set ${r.missing?.join(', ')}.` };
    return { ok: true, message: `Imported ${r.days} days${r.keywordMonths.length ? ` and keywords for ${r.keywordMonths.join(', ')}` : ''}.` };
  } catch (e) {
    return fail(e);
  }
}

const STATUSES = ['listed', 'missing', 'unknown', 'pending'] as const;
export type CitationPatch = { status?: string; url?: string; name_shown?: string; address_shown?: string; phone_shown?: string; notes?: string };

const clip = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/** Save one directory listing: status, link and what it shows. Editors and above. */
export async function saveCitation(id: number, patch: CitationPatch): Promise<Result> {
  try {
    await requireSearch('draft');
    if (patch.status !== undefined && !(STATUSES as readonly string[]).includes(patch.status)) return { ok: false, error: 'Unknown status.' };
    const url = clip(patch.url);
    if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: 'The link must start with https:// or http://.' };
    const row: Record<string, unknown> = { checked_at: new Date().toISOString() };
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.url !== undefined) row.url = url || null;
    for (const k of ['name_shown', 'address_shown', 'phone_shown', 'notes'] as const) if (patch[k] !== undefined) row[k] = clip(patch[k]) || null;
    const { error } = await createAdminClient().from('seo_citation').update(row).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
    return { ok: true, message: 'Saved.' };
  } catch (e) {
    return fail(e);
  }
}

/** Add a directory to the checklist (only ones we genuinely belong to: strategy §5). */
export async function addCitation(directory: string): Promise<Result> {
  try {
    await requireSearch('draft');
    const name = clip(directory, 80);
    if (!name) return { ok: false, error: 'Give the directory a name.' };
    const { error } = await createAdminClient().from('seo_citation').insert({ directory: name });
    if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'That directory is already on the list.' : error.message };
    revalidatePath(PATH);
    return { ok: true, message: 'Added.' };
  } catch (e) {
    return fail(e);
  }
}
