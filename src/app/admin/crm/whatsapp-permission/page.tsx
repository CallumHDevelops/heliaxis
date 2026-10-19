import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { HUB_PATH } from '@/lib/portals';
import { schemaReady } from '@/lib/schema-ready';
import { WaPermissionView } from './WaPermissionView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp permission' };

/** Who's agreed to automatic WhatsApp messages: the review list and the "only with permission" rule. */
export default async function WaPermissionPage() {
  const s = await requirePortal('crm');
  if (!s) redirect(`${HUB_PATH}?denied=1`);
  const schema = await schemaReady();
  return (
    <AdminShell active="crm">
      <WaPermissionView isAdmin={s.profile.role === 'admin'} ready={schema.crmV3} />
    </AdminShell>
  );
}
