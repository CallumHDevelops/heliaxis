import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { cleanSearch } from '@/lib/global-search';
import { listCustomers } from '@/lib/organisations/customers-server';
import { canAccess } from '@/lib/portals';

export const dynamic = 'force-dynamic';

/** Customers (people who came in as enquiries) for CRM › Contacts: those ?q= finds (word by word, as the CRM search does), or the newest 40. Their pages are their jobs'. */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const q = cleanSearch(new URL(req.url).searchParams.get('q'));
  try {
    return json({ people: await listCustomers(createAdminClient(), q, canAccess(s.profile, 'enquiries')), newest: q.length < 2 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Couldn’t read the customers.' }, 500);
  }
}
