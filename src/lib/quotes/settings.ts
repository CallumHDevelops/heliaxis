import 'server-only';
import { parseKv, toKv } from '@/lib/kv-json';
import { createAdminClient } from '@/lib/supabase/admin';

/** Quote settings kept in cms_kv (no SQL): the margin Heliaxis wants on a job. 0 = no target. */
export type QuoteSettings = { minMarginPct: number };
const KEY = 'quote-settings';

export async function readQuoteSettings(): Promise<QuoteSettings> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  const v = Number(parseKv<QuoteSettings>(data?.value).minMarginPct);
  return { minMarginPct: Number.isFinite(v) ? Math.max(0, Math.min(90, v)) : 0 };
}

export async function writeQuoteSettings(s: Partial<QuoteSettings>): Promise<{ ok: true; settings: QuoteSettings } | { ok: false; error: string }> {
  const settings: QuoteSettings = { minMarginPct: Math.max(0, Math.min(90, Number(s.minMarginPct) || 0)) };
  const now = new Date().toISOString();
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: KEY, value: toKv(settings), updated_at: now });
  return error ? { ok: false, error: error.message } : { ok: true, settings };
}
