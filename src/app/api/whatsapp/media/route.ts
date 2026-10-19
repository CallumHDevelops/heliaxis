import { canAccess } from '@/lib/portals';
import { savedToJob } from '@/lib/whatsapp/media';
import { chatSession, isUuid, json } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

/** ?job={project id}: which chat photos are already in that job's photos, so the chat can say "Saved to job ✓". */
export async function GET(req: Request) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!canAccess(s.profile, 'crm')) return json({ saved: [] });
  const job = new URL(req.url).searchParams.get('job') ?? '';
  if (!isUuid(job)) return json({ error: 'Job not found' }, 404);
  return json({ saved: await savedToJob(job) });
}
