import { canAccess } from '@/lib/portals';
import { leadValues, sendableTemplates } from '@/lib/whatsapp/templates';
import { isUuid, json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

/** Approved templates for the Send template pickers; with ?enquiry=, what's known to fill their blanks. */
export async function GET(req: Request) {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const enquiry = new URL(req.url).searchParams.get('enquiry') || '';
  const me = { name: s.profile.full_name || s.profile.email?.split('@')[0] || null, crm: canAccess(s.profile, 'crm') };
  const [items, values] = await Promise.all([sendableTemplates(), isUuid(enquiry) ? leadValues(enquiry, me) : Promise.resolve({})]);
  return json({ items, values });
}
