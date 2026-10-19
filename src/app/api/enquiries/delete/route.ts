import { requireApproved } from '@/lib/auth';
import { json } from '@/lib/crm/server';
import { deleteCustomers, isCustomerId, MAX_DELETE, previewDelete } from '@/lib/crm/delete-customer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Delete customers in bulk (Enquiries → Select). Admins only.
 * { ids, preview: true } → what would go (for the confirmation); changes nothing.
 * { ids, includeSigned? } → deletes them. Signed quotes and paid deposits are kept unless includeSigned.
 * Up to 200 ids a call; answers with counts and a line for each one that wasn't deleted.
 */
export async function POST(req: Request) {
  const s = await requireApproved();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can delete customers.' }, 403);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const ids = b?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_DELETE) {
    return json({ error: `Send between 1 and ${MAX_DELETE} customers at a time.` }, 400);
  }
  if (!ids.every(isCustomerId)) return json({ error: 'Unknown customer' }, 400);

  try {
    if (b?.preview === true) return json(await previewDelete(ids));
    return json(await deleteCustomers(ids, { includeSigned: b?.includeSigned === true }));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not delete them' }, 500);
  }
}
