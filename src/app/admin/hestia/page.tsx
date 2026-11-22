import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { HestiaAdmin } from './HestiaAdmin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hestia — Heliaxis CMS', robots: { index: false, follow: false } };

/** CRM › Hestia: customers’ ratings of her answers, the review queue, and the approved examples she learns from. */
export default async function HestiaPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  return (
    <AdminShell active="hestia" fluid>
      <HestiaAdmin />
    </AdminShell>
  );
}
