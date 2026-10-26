import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { DEFAULT_ASSUMPTIONS, type Assumptions } from './costs';

const KEY = 'social-costs';

/** The defaults, with whatever an admin has saved on top. */
export async function loadAssumptions(): Promise<Assumptions> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    const saved = parseKv<Assumptions>(data?.value);
    return { ...DEFAULT_ASSUMPTIONS, ...saved, fixed_costs_gbp: { ...DEFAULT_ASSUMPTIONS.fixed_costs_gbp, ...(saved.fixed_costs_gbp ?? {}) } };
  } catch {
    return DEFAULT_ASSUMPTIONS;
  }
}

export async function saveAssumptions(a: Assumptions) {
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: KEY, value: toKv(a), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save: ${error.message}`);
}
