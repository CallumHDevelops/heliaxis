'use server';

import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { saveLegalSignOff } from '@/lib/social/competitors/data';
import { METRICS } from '@/lib/social/competitors/league';
import { createAdminClient } from '@/lib/supabase/admin';

async function admin() {
  const s = await requirePortal('social_monitoring');
  if (!s || s.profile.role !== 'admin') throw new Error('Only an admin can change this');
  return s;
}
const text = (f: FormData, k: string, max = 300) => String(f.get(k) ?? '').trim().slice(0, max);
const refresh = () => {
  revalidatePath('/admin/social/competitors');
  revalidatePath('/admin/social/competitors/manage');
};

/** The legal check: an admin confirms they have read how data is collected, and automated collection can then start. */
export async function signOffLegal(f: FormData) {
  const s = await admin();
  if (f.get('agree') !== 'yes') throw new Error('Tick the box to confirm');
  await saveLegalSignOff({ signed_by: s.user.id, signed_at: new Date().toISOString(), version: 1 });
  revalidatePath('/admin/social/competitors/legal');
  refresh();
}

export async function addCompetitor(f: FormData) {
  const s = await admin();
  const name = text(f, 'name', 120);
  if (!name) return;
  const now = new Date().toISOString();
  await createAdminClient().from('social_competitor').insert({
    name,
    website: text(f, 'website') || null,
    base_location: text(f, 'base_location') || null,
    instagram_username: text(f, 'instagram_username').replace(/^@/, '') || null,
    facebook_url: text(f, 'facebook_url') || null,
    trustpilot_url: text(f, 'trustpilot_url') || null,
    tracked: true,
    tracked_since: now.slice(0, 10),
    approved_by: s.user.id,
    approved_at: now,
  });
  refresh();
}

export async function toggleTracked(f: FormData) {
  const s = await admin();
  const id = text(f, 'id');
  const on = f.get('on') === 'yes';
  await createAdminClient()
    .from('social_competitor')
    .update(on ? { tracked: true, tracked_since: new Date().toISOString().slice(0, 10), approved_by: s.user.id, approved_at: new Date().toISOString() } : { tracked: false })
    .eq('id', id)
    .eq('is_self', false);
  refresh();
}

export async function updateCompetitor(f: FormData) {
  await admin();
  await createAdminClient()
    .from('social_competitor')
    .update({
      website: text(f, 'website') || null,
      base_location: text(f, 'base_location') || null,
      instagram_username: text(f, 'instagram_username').replace(/^@/, '') || null,
      facebook_url: text(f, 'facebook_url') || null,
      trustpilot_url: text(f, 'trustpilot_url') || null,
      notes: text(f, 'notes', 1000) || null,
    })
    .eq('id', text(f, 'id'));
  revalidatePath(`/admin/social/competitors/${text(f, 'id')}`);
  refresh();
}

/** A suggestion becomes a tracked competitor only when an admin approves it. */
export async function decideSuggestion(f: FormData) {
  const s = await admin();
  const db = createAdminClient();
  const id = Number(f.get('id'));
  const approve = f.get('approve') === 'yes';
  const { data: sug } = await db.from('social_competitor_suggestion').select('*').eq('id', id).maybeSingle();
  if (!sug || sug.status !== 'pending') return;
  let competitorId: string | null = null;
  if (approve) {
    const now = new Date().toISOString();
    const { data: c } = await db.from('social_competitor').insert({ name: sug.name, website: sug.website, base_location: sug.base_location, tracked: true, tracked_since: now.slice(0, 10), approved_by: s.user.id, approved_at: now }).select('id').single();
    competitorId = c?.id ?? null;
  }
  await db.from('social_competitor_suggestion').update({ status: approve ? 'approved' : 'rejected', decided_by: s.user.id, decided_at: new Date().toISOString(), competitor_id: competitorId }).eq('id', id);
  refresh();
}

/** Records the figures someone checked by hand (a screenshot or link as the source), one row per metric given. */
export async function recordFigures(f: FormData) {
  await admin();
  const competitorId = text(f, 'id');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text(f, 'date')) ? text(f, 'date') : new Date().toISOString().slice(0, 10);
  const source = text(f, 'source', 300) || 'Checked by hand';
  const rows = [];
  for (const m of METRICS) {
    const raw = text(f, `m:${m.key}`, 20).replace(/,/g, '');
    const unavailable = text(f, `u:${m.key}`, 200);
    if (raw === '' && !unavailable) continue;
    const n = raw === '' ? null : Number(raw);
    if (n != null && !Number.isFinite(n)) continue;
    rows.push({ competitor_id: competitorId, date, platform: m.platform, metric: m.key, value: n, unavailable_reason: n == null ? unavailable : null, method: 'manual', source });
  }
  if (rows.length) await createAdminClient().from('social_competitor_snapshot').upsert(rows, { onConflict: 'competitor_id,date,platform,metric' });
  revalidatePath(`/admin/social/competitors/${competitorId}`);
  refresh();
}
