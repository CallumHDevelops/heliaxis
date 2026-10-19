import { requireApproved } from '@/lib/auth';
import { json } from '@/lib/crm/server';
import { deleteCustomers, isCustomerId } from '@/lib/crm/delete-customer';

export const dynamic = 'force-dynamic';

/**
 * Delete one customer and everything about them (src/lib/crm/delete-customer.ts). Admins only.
 * ?include_signed=1 also deletes one with a signed quote or paid deposit. Someone already gone is
 * fine (safe to repeat).
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApproved();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can delete customers.' }, 403);
  const { id } = await params;
  if (!isCustomerId(id)) return json({ error: 'Not found' }, 404);
  const includeSigned = new URL(req.url).searchParams.get('include_signed') === '1';
  const r = await deleteCustomers([id], { includeSigned }).catch((e: unknown) => (e instanceof Error ? e.message : 'Could not delete them'));
  if (typeof r === 'string') return json({ error: r }, 500);
  const why = r.errors[0];
  if (why) return json({ ...r, error: why.error }, why.held ? 409 : 500);
  return json({ ok: true, ...r });
}
