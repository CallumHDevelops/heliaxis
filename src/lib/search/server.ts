import 'server-only';
import { cache } from 'react';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { can, parseSetting, searchRole, type SearchRole, type SettingKey, type SettingValue } from './settings';

type Db = ReturnType<typeof createAdminClient>;

export async function getSetting<K extends SettingKey>(key: K, db: Db = createAdminClient()): Promise<SettingValue<K>> {
  const { data } = await db.from('seo_setting').select('value').eq('key', key).maybeSingle();
  return parseSetting(key, data?.value);
}

export async function putSetting<K extends SettingKey>(key: K, value: unknown, by: string, db: Db = createAdminClient()): Promise<SettingValue<K>> {
  const v = parseSetting(key, value);
  const { error } = await db.from('seo_setting').upsert({ key, value: v, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return v;
}

export type SearchSession = {
  userId: string;
  name: string;
  role: SearchRole;
};

/** The signed-in user and their role in Search, or null without the portal. One lookup per request. */
export const searchSession = cache(async (): Promise<SearchSession | null> => {
  const s = await requirePortal('search');
  if (!s) return null;
  const access = await getSetting('access').catch(() => parseSetting('access', {}));
  const role = searchRole({ id: s.user.id, role: s.profile.role }, access);
  return { userId: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone', role };
});

export async function requireSearch(need: 'view' | 'draft' | 'spend' | 'publish' = 'view'): Promise<SearchSession> {
  const s = await searchSession();
  if (!s) throw new Error('You don’t have access to Search.');
  if (need === 'draft' && !can.draft(s.role)) throw new Error('Only editors and above can do this.');
  if ((need === 'spend' || need === 'publish') && !can.spend(s.role)) throw new Error('Only an admin or the owner can do this.');
  return s;
}

/* ── Spend ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

const monthStart = (d = new Date()) => {
  const uk = d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7);
  return `${uk}-01`;
};

/** This month's spend at a vendor (UK calendar month), from the call log. */
export async function monthSpend(vendor = 'dataforseo', db: Db = createAdminClient()): Promise<number> {
  const { data } = await db.from('seo_api_call').select('cost_usd').eq('vendor', vendor).gte('at', `${monthStart()}T00:00:00Z`).limit(20000);
  return Math.round((data ?? []).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0) * 10000) / 10000;
}

export type Budget = { vendor: string; spent: number; cap: number; left: number };

export async function budget(vendor = 'dataforseo', db: Db = createAdminClient()): Promise<Budget> {
  const [spent, b] = await Promise.all([monthSpend(vendor, db), getSetting('budget', db)]);
  const cap = b.caps[vendor] ?? 0;
  return { vendor, spent, cap, left: Math.max(0, cap - spent) };
}

/** Throws when a run estimated at `estimate` dollars would pass the cap, unless the owner overrides it. */
export async function checkCap(estimate: number, opts: { override?: boolean; vendor?: string } = {}, db: Db = createAdminClient()): Promise<Budget> {
  const b = await budget(opts.vendor, db);
  if (!opts.override && b.spent + estimate > b.cap) {
    throw new Error(`This would cost about $${estimate.toFixed(2)} and take this month past the $${b.cap.toFixed(0)} cap ($${b.spent.toFixed(2)} spent).`);
  }
  return b;
}
