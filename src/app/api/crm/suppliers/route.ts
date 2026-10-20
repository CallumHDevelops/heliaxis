import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { NOT_READY, ordersReady } from '@/lib/purchase-orders/server';
import { cleanSupplier, nameTaken } from '@/lib/purchase-orders/suppliers';

export const dynamic = 'force-dynamic';

/** Suppliers by name, with how many orders each has. ?all=1 includes the archived ones. */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ ready: false, suppliers: [] });
  const all = new URL(req.url).searchParams.get('all') === '1';
  const db = createAdminClient();
  let q = db.from('suppliers').select('*').order('name').limit(1000);
  if (!all) q = q.is('archived_at', null);
  const [{ data, error }, { data: used }] = await Promise.all([q, db.from('purchase_orders').select('supplier_id').limit(10000)]);
  if (error) return json({ error: error.message }, 500);
  const counts = new Map<string, number>();
  for (const o of used ?? []) counts.set(o.supplier_id as string, (counts.get(o.supplier_id as string) ?? 0) + 1);
  return json({ ready: true, suppliers: (data ?? []).map((s) => ({ ...s, orders: counts.get(s.id as string) ?? 0 })) });
}

/** Add a supplier: name, and optionally contact name, email, phone, our account number, address, notes. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const clean = cleanSupplier(await req.json().catch(() => ({})), true);
  if (!clean.ok) return json({ error: clean.error }, 400);
  const { data, error } = await createAdminClient()
    .from('suppliers')
    .insert({ ...clean.fields, created_by: s.user.id })
    .select('*')
    .single();
  if (error) return json({ error: nameTaken(error, clean.fields.name) ?? error.message }, nameTaken(error, '') ? 409 : 500);
  return json({ supplier: { ...data, orders: 0 } });
}
