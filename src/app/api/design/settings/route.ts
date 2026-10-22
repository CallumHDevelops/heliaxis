import { createAdminClient } from '@/lib/supabase/admin';
import { designSession, json } from '@/lib/design/server';

export const dynamic = 'force-dynamic';

/**
 * Org-wide print settings for the Design studio, kept in cms_kv (no extra SQL):
 * { colours: { [brandColourId]: [c,m,y,k] }, richBlack: [c,m,y,k] }. Readable by anyone with the
 * studio; only admins can change them (they're brand-level decisions).
 */
const KEY = 'design-print-settings';
type Cmyk = [number, number, number, number];

function clean(v: unknown): { colours: Record<string, Cmyk>; richBlack: Cmyk | null } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { colours?: unknown; richBlack?: unknown };
  const ok = (a: unknown): a is Cmyk => Array.isArray(a) && a.length === 4 && a.every((n) => typeof n === 'number' && n >= 0 && n <= 100);
  const colours: Record<string, Cmyk> = {};
  if (o.colours && typeof o.colours === 'object') {
    for (const [k, val] of Object.entries(o.colours as Record<string, unknown>)) {
      if (/^[a-z0-9]{1,20}$/i.test(k) && ok(val)) colours[k] = val.map((n) => Math.round(n)) as Cmyk;
    }
  }
  return { colours, richBlack: ok(o.richBlack) ? (o.richBlack.map((n) => Math.round(n)) as Cmyk) : null };
}

export async function GET() {
  if (!(await designSession())) return json({ error: 'unauthorized' }, 401);
  const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
  let settings = null;
  try {
    settings = data?.value ? clean(JSON.parse(data.value as string)) : null;
  } catch {
    settings = null;
  }
  return json({ settings: settings ?? { colours: {}, richBlack: null } });
}

export async function PUT(req: Request) {
  const s = await designSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can change the brand’s print colours.' }, 403);
  const settings = clean(await req.json().catch(() => null));
  if (!settings) return json({ error: 'Those print settings look wrong.' }, 400);
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(settings), updated_at: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);
  return json({ settings });
}
