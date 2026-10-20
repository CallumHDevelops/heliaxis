import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { NOT_READY, ordersReady } from '@/lib/purchase-orders/server';
import { cleanSupplier, nameTaken } from '@/lib/purchase-orders/suppliers';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** Change a supplier's details, or archive it (`archived: true`) / bring it back (`archived: false`). */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const clean = cleanSupplier(b, false);
  if (!clean.ok) return json({ error: clean.error }, 400);
  const u: Record<string, unknown> = { ...clean.fields, updated_at: new Date().toISOString() };
  if (typeof b.archived === 'boolean') u.archived_at = b.archived ? new Date().toISOString() : null;
  const db = createAdminClient();
  const { data, error } = await db.from('suppliers').update(u).eq('id', id).select('*').maybeSingle();
  if (error) {
    const { data: was } = await db.from('suppliers').select('name').eq('id', id).maybeSingle();
    return json({ error: nameTaken(error, clean.fields.name ?? was?.name) ?? error.message }, error.code === '23505' ? 409 : 500);
  }
  if (!data) return json({ error: 'That supplier isn’t there any more.' }, 404);
  return json({ supplier: data });
}

/** Remove a supplier: deleted if no order has used it, otherwise archived (the orders keep their supplier). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { count } = await db.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('supplier_id', id);
  if ((count ?? 0) > 0) {
    const { error } = await db.from('suppliers').update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).is('archived_at', null);
    if (error) return json({ error: error.message }, 500);
    return json({ archived: true, message: `Archived, not deleted: ${count} order${count === 1 ? ' uses' : 's use'} this supplier.` });
  }
  const { error } = await db.from('suppliers').delete().eq('id', id);
  // An order made in the meantime: archive instead.
  if (error?.code === '23503') {
    await db.from('suppliers').update({ archived_at: new Date().toISOString() }).eq('id', id);
    return json({ archived: true, message: 'Archived, not deleted: an order uses this supplier.' });
  }
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
}
