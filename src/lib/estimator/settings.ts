import 'server-only';
import { parseKv, toKv } from '@/lib/kv-json';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanSettings, type EstimatorSettings } from './calc';

const KEY = 'estimator-settings';

/** The estimator's prices and assumptions, kept in cms_kv (no SQL): defaults until someone saves their own. */
export async function readEstimatorSettings(): Promise<EstimatorSettings> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    return cleanSettings(parseKv<EstimatorSettings>(data?.value));
  } catch {
    return cleanSettings({});
  }
}

export async function writeEstimatorSettings(v: unknown): Promise<{ ok: true; settings: EstimatorSettings } | { ok: false; error: string }> {
  const settings = cleanSettings(v);
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: KEY, value: toKv(settings), updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true, settings };
}
