import { canAccess } from '@/lib/portals';
import { leadValues, sendableTemplates } from '@/lib/whatsapp/templates';
import { chatSession, isUuid, json, mayOpenChat } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

/**
 * Approved templates for the Send template pickers; with ?enquiry=, what's known to fill their blanks.
 * CRM staff too, for a customer with a job (as the chat itself).
 */
export async function GET(req: Request) {
  const s = await chatSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const enquiry = new URL(req.url).searchParams.get('enquiry') || '';
  if (enquiry && !(await mayOpenChat(s, enquiry))) return json({ error: 'Not found' }, 404);
  const me = { name: s.profile.full_name || s.profile.email?.split('@')[0] || null, crm: canAccess(s.profile, 'crm') };
  const [items, values] = await Promise.all([sendableTemplates(), isUuid(enquiry) ? leadValues(enquiry, me) : Promise.resolve({})]);
  return json({ items, values });
}
