import { catchUpCount, catchUpRun } from '@/lib/crm/chat-contacted';
import { crmSession, json } from '@/lib/crm/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The one-tap catch-up for WhatsApp chats imported before imports moved people to Contacted
 * (src/lib/crm/chat-contacted.ts). Admins only, like the import itself.
 * GET → { customers }: how many customers you've messaged on WhatsApp are still at Lead (or New).
 * POST → { moved, remaining }: moves the next few; the page calls it until nobody's left.
 */
async function admin() {
  const s = await crmSession();
  return s?.profile.role === 'admin' ? s : null;
}

export async function GET() {
  if (!(await admin())) return json({ error: 'unauthorized' }, 401);
  try {
    return json({ customers: await catchUpCount() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not count them', customers: 0 }, 500);
  }
}

export async function POST() {
  const s = await admin();
  if (!s) return json({ error: 'unauthorized' }, 401);
  try {
    return json(await catchUpRun(s.user.id));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not move them' }, 500);
  }
}
