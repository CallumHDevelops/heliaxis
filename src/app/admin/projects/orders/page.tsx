import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { ukDay } from '@/lib/bank-holidays';
import { isUuid } from '@/lib/crm/server';
import { listOrders } from '@/lib/purchase-orders/server';
import { schemaReady } from '@/lib/schema-ready';
import { createAdminClient } from '@/lib/supabase/admin';
import { OrdersPage, type OrdersView } from './OrdersPage';

export const dynamic = 'force-dynamic';

const ukToday = () => ukDay(Date.now());

/**
 * Projects → Purchase orders: every order on every job (deliveries due soonest first), and the
 * suppliers (?view=suppliers). ?po= opens one. Read here too, so the first paint has them.
 */
export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const [sp, schema] = await Promise.all([searchParams, schemaReady()]);
  const ready = schema.purchaseOrders;
  const orders = ready ? await listOrders(createAdminClient()).catch(() => []) : [];
  const view: OrdersView = sp.view === 'suppliers' ? 'suppliers' : 'orders';
  const po = typeof sp.po === 'string' && isUuid(sp.po) ? sp.po : null;
  return (
    <AdminShell active="crm" fluid>
      <OrdersPage ready={ready} initial={orders} today={ukToday()} initialView={view} openId={po} myName={session.profile.full_name ?? null} />
    </AdminShell>
  );
}
