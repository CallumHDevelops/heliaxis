import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { cleanLines, isDay, isPoStatus, totals } from '@/lib/purchase-orders/money';
import { deliveryFor, listOrders, logOrder, NOT_READY, orderWords, ordersReady, readOrder, saveLines } from '@/lib/purchase-orders/server';

export const dynamic = 'force-dynamic';

const NOTE_MAX = 2000;
const note = (v: unknown) => String(v ?? '').trim().slice(0, NOTE_MAX) || null;

/**
 * Purchase orders, newest first (up to 2,000). ?status= draft | sent | confirmed | delivered |
 * cancelled | open (sent or confirmed), ?supplier=, ?project= (one job's), ?q= (PO number, job
 * reference or customer), ?due=YYYY-MM-DD (open orders needed by then).
 */
export async function GET(req: Request) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ ready: false, orders: [] });
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status');
  const supplier = sp.get('supplier');
  const project = sp.get('project');
  const due = sp.get('due');
  if (status && status !== 'open' && !isPoStatus(status)) return json({ error: 'Unknown status' }, 400);
  if ((supplier && !isUuid(supplier)) || (project && !isUuid(project))) return json({ error: 'Not found' }, 404);
  if (due && !isDay(due)) return json({ error: 'The date should be YYYY-MM-DD' }, 400);
  try {
    const orders = await listOrders(createAdminClient(), { status, supplier, project, due, q: (sp.get('q') ?? '').slice(0, 100) });
    return json({ ready: true, orders });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not read the orders' }, 500);
  }
}

/** A new draft order on a job: its supplier, where it goes, when it's needed, notes and lines. */
export async function POST(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const b = await req.json().catch(() => ({}));
  const projectId = String(b.project_id ?? '');
  const supplierId = String(b.supplier_id ?? '');
  if (!isUuid(projectId)) return json({ error: 'Which job is it for?' }, 400);
  if (!isUuid(supplierId)) return json({ error: 'Choose a supplier.' }, 400);
  const db = createAdminClient();
  const [{ data: job }, { data: supplier }] = await Promise.all([
    db.from('crm_projects').select('id').eq('id', projectId).maybeSingle(),
    db.from('suppliers').select('id, name, archived_at').eq('id', supplierId).maybeSingle(),
  ]);
  if (!job) return json({ error: 'That job isn’t there any more.' }, 404);
  if (!supplier) return json({ error: 'That supplier isn’t there any more.' }, 404);
  if (supplier.archived_at) return json({ error: `${supplier.name} is archived. Bring them back from Suppliers first, or choose another.` }, 400);

  const where = await deliveryFor(b.deliver_to ?? 'site', b);
  if (!where.ok) return json({ error: where.error }, 400);
  if (b.required_by && !isDay(b.required_by)) return json({ error: 'The required-by date isn’t a real date.' }, 400);
  const lines = cleanLines(b.lines ?? []);
  if (!lines.ok) return json({ error: lines.error }, 400);
  const t = totals(lines.lines);

  const { data: row, error } = await db
    .from('purchase_orders')
    .insert({
      project_id: projectId,
      supplier_id: supplierId,
      status: 'draft',
      deliver_to: where.deliver_to,
      deliver_address: where.deliver_address,
      deliver_postcode: where.deliver_postcode,
      required_by: b.required_by || null,
      notes: note(b.notes),
      internal_note: note(b.internal_note),
      net_pence: t.net,
      vat_pence: t.vatTotal,
      gross_pence: t.gross,
      created_by: s.user.id,
    })
    .select('id, po_number, project_id, net_pence')
    .single();
  if (error || !row) return json({ error: error?.message || 'Not saved' }, 500);
  if (lines.lines.length) {
    const failed = await saveLines(db, row.id, lines.lines);
    if (failed) {
      // Nothing half-saved: the order goes again (its number isn't reused).
      await db.from('purchase_orders').delete().eq('id', row.id);
      return json({ error: failed }, 500);
    }
  }
  await logOrder(db, row, 'created', `Purchase order ${orderWords({ po_number: row.po_number, net_pence: t.net }, supplier.name)} drafted`, s.user.id);
  return json(await readOrder(db, row.id));
}
