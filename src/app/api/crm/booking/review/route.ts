import { crmSession, json } from '@/lib/crm/server';
import { reviewDiary } from '@/lib/booking/review';

export const dynamic = 'force-dynamic';

/** "What your diary says" (read-only; ?fresh=1 reads Outlook again instead of the hour's copy). */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  return json(await reviewDiary({ fresh }));
}
