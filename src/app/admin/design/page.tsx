import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';
import { DesignStudio } from './DesignStudio';
import './design.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Design studio · Heliaxis',
  robots: { index: false, follow: false },
};

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await requirePortal('design');
  if (!session) redirect('/admin?denied=design');
  const [{ project }, schema] = await Promise.all([searchParams, schemaReady()]);
  const projectId = project && /^[0-9a-f-]{36}$/i.test(project) ? project : null;

  return (
    <AdminShell active="design" flush>
      <DesignStudio cloudReady={schema.design} isAdmin={session.profile.role === 'admin'} projectId={projectId} />
    </AdminShell>
  );
}
