import { crmSession, json } from '@/lib/crm/server';
import { readQuoteSettings, writeQuoteSettings } from '@/lib/quotes/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  return json(await readQuoteSettings());
}

/** Set the minimum margin wanted: { minMarginPct }. Admins only. */
export async function PUT(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can change the margin target.' }, 403);
  const b = await req.json().catch(() => ({}));
  const r = await writeQuoteSettings({ minMarginPct: b.minMarginPct });
  return r.ok ? json(r.settings) : json({ error: r.error }, 500);
}
