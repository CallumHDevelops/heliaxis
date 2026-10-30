import 'server-only';
import { parseKv, toKv } from '@/lib/kv-json';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Whose signature goes under a quote's introduction: each person draws their own (a name, a role and a PNG), kept against them in
 * cms_kv (no SQL to run). `shared` is their own tick: anyone with CRM access may then sign a quote in their name.
 */
export type Signatory = { name: string; role: string; png: string; shared: boolean };
export type SignatoryRow = Signatory & { userId: string };
const PREFIX = 'quote-signatory:';
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export function cleanSignatory(v: unknown): Signatory | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const png = typeof o.png === 'string' ? o.png : '';
  const name = String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name || !PNG_URL.test(png) || png.length > 400_000) return null;
  return { name, role: String(o.role ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), png, shared: o.shared === true };
}

export async function readSignatory(userId: string): Promise<Signatory | null> {
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', PREFIX + userId).maybeSingle();
  return cleanSignatory(parseKv<Signatory>(data?.value));
}

/** The signatures other people have shared with everyone on the CRM. */
export async function sharedSignatories(exceptUserId: string): Promise<SignatoryRow[]> {
  const { data } = await createAdminClient().from('cms_kv').select('key, value').like('key', `${PREFIX}%`);
  return (data ?? []).flatMap((r) => {
    const userId = String(r.key).slice(PREFIX.length);
    const s = cleanSignatory(parseKv<Signatory>(r.value));
    return s && s.shared && userId !== exceptUserId ? [{ ...s, userId }] : [];
  });
}

/** Can this person sign a quote as `signerId`? Themselves always, anyone else only if they have shared theirs. */
export async function mayUse(signerId: string, byUserId: string): Promise<boolean> {
  if (signerId === byUserId) return !!(await readSignatory(signerId));
  return !!(await readSignatory(signerId))?.shared;
}

export async function writeSignatory(userId: string, v: unknown): Promise<{ ok: true; signatory: Signatory } | { ok: false; error: string }> {
  const s = cleanSignatory(v);
  if (!s) return { ok: false, error: 'Add your name and draw your signature.' };
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: PREFIX + userId, value: toKv(s), updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true, signatory: s };
}

export async function clearSignatory(userId: string): Promise<void> {
  await createAdminClient().from('cms_kv').delete().eq('key', PREFIX + userId);
}
