import 'server-only';
import { parseKv, toKv } from '@/lib/kv-json';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Whose signature goes under the quote's introduction: a name, a role and a drawn signature (a PNG), kept once for the company
 * in cms_kv so every quote uses it. No SQL to run.
 */
export type Signatory = { name: string; role: string; png: string };
const KEY = 'quote-signatory';
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export function cleanSignatory(v: unknown): Signatory | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const png = typeof o.png === 'string' ? o.png : '';
  const name = String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name || !PNG_URL.test(png) || png.length > 400_000) return null;
  return { name, role: String(o.role ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), png };
}

export async function readSignatory(): Promise<Signatory | null> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  return cleanSignatory(parseKv<Signatory>(data?.value));
}

export async function writeSignatory(v: unknown): Promise<{ ok: true; signatory: Signatory } | { ok: false; error: string }> {
  const s = cleanSignatory(v);
  if (!s) return { ok: false, error: 'Add your name and draw your signature.' };
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: KEY, value: toKv(s), updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true, signatory: s };
}

export async function clearSignatory(): Promise<void> {
  await createAdminClient().from('cms_kv').delete().eq('key', KEY);
}
