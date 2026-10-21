import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { DesignStudio } from './DesignStudio';
import './design.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Design studio · Heliaxis',
  robots: { index: false, follow: false },
};

export default async function DesignPage() {
  const session = await requirePortal('design');
  if (!session) redirect('/admin?denied=design');

  return (
    <AdminShell active="design" flush>
      <DesignStudio />
    </AdminShell>
  );
}
