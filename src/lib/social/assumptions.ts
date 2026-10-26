import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_ASSUMPTIONS, type Assumptions } from './costs';

const KEY = 'social-costs';

/** The defaults, with whatever an admin has saved on top. */
export async function loadAssumptions(): Promise<Assumptions> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    const saved = (data?.value ?? {}) as Partial<Assumptions>;
    return { ...DEFAULT_ASSUMPTIONS, ...saved, fixed_costs_gbp: { ...DEFAULT_ASSUMPTIONS.fixed_costs_gbp, ...(saved.fixed_costs_gbp ?? {}) } };
  } catch {
    return DEFAULT_ASSUMPTIONS;
  }
}

export async function saveAssumptions(a: Assumptions) {
  await createAdminClient().from('cms_kv').upsert({ key: KEY, value: a });
}
