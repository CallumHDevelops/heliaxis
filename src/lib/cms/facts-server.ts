import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { cleanFacts, DEFAULT_FACTS, type Facts } from './facts';

/** The facts sheet lives in its own cms_kv record, never inside the site document: editing a fact must not collide with someone editing pages. */
export const FACTS_KEY = 'heliaxis-facts';
type Db = ReturnType<typeof createAdminClient>;

/** The saved facts, or the seed when nothing has been saved yet (`saved` says which). */
export async function readFacts(db: Db = createAdminClient()): Promise<{ facts: Facts; saved: boolean }> {
  const { data } = await db.from('cms_kv').select('value').eq('key', FACTS_KEY).maybeSingle();
  if (!data?.value) return { facts: DEFAULT_FACTS, saved: false };
  return { facts: cleanFacts(parseKv<Facts>(data.value)), saved: true };
}

export async function saveFacts(input: unknown, by: string, db: Db = createAdminClient()): Promise<Facts> {
  const at = new Date().toISOString();
  const facts: Facts = { ...cleanFacts(input), updatedAt: at, updatedBy: by };
  const { error } = await db.from('cms_kv').upsert({ key: FACTS_KEY, value: toKv(facts), updated_at: at });
  if (error) throw new Error(error.message);
  return facts;
}
