import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { readTrack } from '@/lib/crm/quote-track';
import { readQuote } from '@/lib/quotes/server';

export const dynamic = 'force-dynamic';

/** Where the customer has got to with this quote: opened, PDF, accepting, declined, dates. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const q = await readQuote(id);
  if (!q) return json({ error: 'Not found' }, 404);
  const { data: p } = await createAdminClient().from('crm_projects').select('accepted_at, accepted_name, install_pref').eq('id', q.project_id).maybeSingle();
  return json({
    sentAt: q.sent_at ?? null,
    track: await readTrack(q.project_id),
    acceptedAt: (p?.accepted_at as string | null) ?? null,
    acceptedName: (p?.accepted_name as string | null) ?? null,
    installPref: p?.install_pref ?? null,
  });
}
