import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { readReviewSettings, writeReviewSettings } from '@/lib/reviews/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  return json(await readReviewSettings());
}

/** Save the review links and wording. Admins only. */
export async function PUT(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can change the review links.' }, 403);
  return json(await writeReviewSettings(createAdminClient(), await req.json().catch(() => ({}))));
}
