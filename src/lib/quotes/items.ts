import 'server-only';
import { parseKv, toKv } from '@/lib/kv-json';
import { createAdminClient } from '@/lib/supabase/admin';
import { newId, VAT_RATES } from './types';

/** Saved items: products and services you quote often, kept so a line is one click. Stored in cms_kv, no SQL needed. */
export type SavedItem = { id: string; description: string; detail: string; unit_pence: number; vat_rate: number };
const KEY = 'quote-items';

const clean = (v: unknown): SavedItem[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, 300)
    .map((x: Record<string, unknown>) => ({
      id: String(x.id || '').slice(0, 24) || newId(),
      description: String(x.description || '').trim().slice(0, 300),
      detail: String(x.detail || '').trim().slice(0, 600),
      unit_pence: Math.max(-100_000_000, Math.min(1_000_000_000, Math.round(Number(x.unit_pence) || 0))),
      vat_rate: (VAT_RATES as readonly number[]).includes(Number(x.vat_rate)) ? Number(x.vat_rate) : 0,
    }))
    .filter((x) => x.description);

export async function readSavedItems(): Promise<SavedItem[]> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  return clean(parseKv<{ items: unknown }>(data?.value).items).sort((a, b) => a.description.localeCompare(b.description));
}

export async function writeSavedItems(items: unknown): Promise<{ ok: true; items: SavedItem[] } | { ok: false; error: string }> {
  const list = clean(items);
  const now = new Date().toISOString();
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: KEY, value: toKv({ items: list }), updated_at: now });
  return error ? { ok: false, error: error.message } : { ok: true, items: list };
}
