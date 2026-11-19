'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSearch, putSetting, getSetting, searchSession } from '@/lib/search/server';
import { can, SETTINGS, type SettingKey } from '@/lib/search/settings';
import { liveCheck, startSerpRun } from '@/lib/search/serp-run';
import { runSetupCheck } from '@/lib/search/checklist';
import { buildWeeklyReport } from '@/lib/search/reports';

type Result = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' });

/** Run now: post this week's phone SERPs to DataForSEO's queue (results arrive over the next few minutes). */
export async function runNowAction(opts: { override?: boolean } = {}): Promise<Result> {
  try {
    const s = await requireSearch('spend');
    const runId = await startSerpRun({ device: 'mobile', kind: 'weekly', by: s.name, override: !!opts.override && can.overrideCap(s.role) });
    revalidatePath('/admin/search', 'layout');
    return { ok: true, message: `Run ${runId} posted. Results come back over the next few minutes.` };
  } catch (e) {
    return fail(e);
  }
}

/** Check one search now, live (once a day per search). */
export async function liveCheckAction(keywordId: number): Promise<Result> {
  try {
    const s = await requireSearch('spend');
    await liveCheck(keywordId, s.userId);
    revalidatePath('/admin/search/rankings');
    return { ok: true, message: 'Checked.' };
  } catch (e) {
    return fail(e);
  }
}

/* ── Needs you ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export async function actionStatus(id: number, status: 'done' | 'snoozed' | 'not_relevant', opts: { reason?: string; until?: string } = {}): Promise<Result> {
  try {
    await requireSearch('draft');
    if (status === 'not_relevant' && !opts.reason?.trim()) return { ok: false, error: 'Say why it is not relevant.' };
    const db = createAdminClient();
    const patch =
      status === 'snoozed'
        ? { status, snoozed_until: opts.until || new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) }
        : { status, closed_at: new Date().toISOString(), closed_reason: opts.reason?.trim() || (status === 'done' ? 'Done' : null) };
    const { error } = await db.from('seo_action').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/search', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ── Settings ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export async function saveSetting(key: SettingKey, value: unknown): Promise<Result> {
  try {
    const s = await requireSearch('view');
    if (!(key in SETTINGS)) return { ok: false, error: 'Unknown setting.' };
    if (!can.editSetting(s.role, key)) return { ok: false, error: key === 'business' || key === 'budget' || key === 'access' ? 'Only the owner can change this.' : 'Only an admin or the owner can change this.' };
    const parsed = SETTINGS[key].safeParse(value);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
    await putSetting(key, parsed.data, s.name);
    revalidatePath('/admin/search', 'layout');
    return { ok: true, message: 'Saved.' };
  } catch (e) {
    return fail(e);
  }
}

/** Set one person's role in Search (owner only). There must always be an owner. */
export async function setRole(profileId: string, role: string): Promise<Result> {
  try {
    const s = await requireSearch('view');
    if (s.role !== 'owner') return { ok: false, error: 'Only the owner can change access.' };
    if (!['owner', 'admin', 'editor', 'viewer'].includes(role)) return { ok: false, error: 'Unknown role.' };
    const access = await getSetting('access');
    const roles = { ...access.roles, [profileId]: role as 'owner' | 'admin' | 'editor' | 'viewer' };
    // The first owner to change anything is written down as owner, so "every admin is owner" stops.
    if (!Object.values(access.roles).includes('owner') && profileId !== s.userId) roles[s.userId] = 'owner';
    if (!Object.values(roles).includes('owner')) return { ok: false, error: 'Search needs at least one owner.' };
    await putSetting('access', { roles }, s.name);
    revalidatePath('/admin/search', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Tick a "Can't check automatically" checklist item (or untick it). */
export async function confirmChecklist(item: string, done: boolean): Promise<Result> {
  try {
    const s = await requireSearch('view');
    if (!can.spend(s.role)) return { ok: false, error: 'Only an admin or the owner can tick this.' };
    const c = await getSetting('checklist');
    const confirmed = { ...c.confirmed };
    if (done) confirmed[item] = new Date().toISOString().slice(0, 10);
    else delete confirmed[item];
    await putSetting('checklist', { confirmed }, s.name);
    await runSetupCheck().catch(() => null);
    revalidatePath('/admin/search', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function recheckSetup(): Promise<Result> {
  try {
    await requireSearch('view');
    await runSetupCheck();
    revalidatePath('/admin/search', 'layout');
    return { ok: true, message: 'Checked.' };
  } catch (e) {
    return fail(e);
  }
}

/* ── Keywords ──────────────────────────────────────────────────────────────────────────────────────────────────── */

const SERVICES = ['solar', 'battery', 'heat_pump', 'ev', 'infrared', 'general'];
const INTENTS = ['local_commercial', 'commercial', 'informational'];

/** Bulk add: one search per line, "phrase | town" (town optional). */
export async function addKeywords(text: string, defaults: { service?: string; intent?: string; priority?: number; source?: string } = {}): Promise<Result> {
  try {
    await requireSearch('spend');
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 300)
      .map((l) => {
        const [phrase, town] = l.split('|').map((x) => x.trim());
        return {
          phrase: phrase.slice(0, 120),
          town: town || null,
          service: SERVICES.includes(defaults.service ?? '') ? defaults.service : guessService(phrase),
          intent: INTENTS.includes(defaults.intent ?? '') ? defaults.intent : /cost|price|worth|how|what|grant/i.test(phrase) ? 'commercial' : 'local_commercial',
          priority: [1, 2, 3].includes(Number(defaults.priority)) ? Number(defaults.priority) : 2,
          source: defaults.source ?? 'manual',
        };
      })
      .filter((r) => r.phrase);
    if (!rows.length) return { ok: false, error: 'Nothing to add.' };
    const { error, data } = await createAdminClient().from('seo_keyword').upsert(rows, { onConflict: 'phrase,town', ignoreDuplicates: true }).select('id');
    if (error) throw new Error(error.message);
    revalidatePath('/admin/search', 'layout');
    return { ok: true, message: `${data?.length ?? 0} added.` };
  } catch (e) {
    return fail(e);
  }
}

function guessService(p: string) {
  if (/solar and battery/i.test(p)) return 'solar';
  if (/battery|storage/i.test(p)) return 'battery';
  if (/heat pump/i.test(p)) return 'heat_pump';
  if (/\bev\b|charger|charging/i.test(p)) return 'ev';
  if (/infrared/i.test(p)) return 'infrared';
  if (/solar|pv/i.test(p)) return 'solar';
  return 'general';
}

export async function updateKeyword(id: number, patch: { priority?: number; active?: boolean; target_page?: string | null; intent?: string; service?: string; devices?: string[] }): Promise<Result> {
  try {
    await requireSearch('spend');
    const clean: Record<string, unknown> = {};
    if (patch.priority !== undefined && [1, 2, 3].includes(patch.priority)) clean.priority = patch.priority;
    if (patch.active !== undefined) clean.active = !!patch.active;
    if (patch.target_page !== undefined) clean.target_page = patch.target_page ? String(patch.target_page).slice(0, 200) : null;
    if (patch.intent && INTENTS.includes(patch.intent)) clean.intent = patch.intent;
    if (patch.service && SERVICES.includes(patch.service)) clean.service = patch.service;
    if (patch.devices) clean.devices = patch.devices.filter((d) => d === 'mobile' || d === 'desktop');
    const { error } = await createAdminClient().from('seo_keyword').update(clean).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/search', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rebuildWeeklyReport(): Promise<Result> {
  try {
    await requireSearch('spend');
    await buildWeeklyReport({ status: 'provisional' });
    revalidatePath('/admin/search/reports');
    return { ok: true, message: 'Built.' };
  } catch (e) {
    return fail(e);
  }
}

export async function whoAmI() {
  return searchSession();
}
