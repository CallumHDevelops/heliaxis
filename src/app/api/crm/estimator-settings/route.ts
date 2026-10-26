import { crmSession, json } from '@/lib/crm/server';
import { readEstimatorSettings, writeEstimatorSettings } from '@/lib/estimator/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  return json(await readEstimatorSettings());
}

/** Save the estimator's prices and assumptions. Admins only. */
export async function PUT(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can change the estimator’s prices.' }, 403);
  const r = await writeEstimatorSettings(await req.json().catch(() => ({})));
  return r.ok ? json(r.settings) : json({ error: r.error }, 500);
}
