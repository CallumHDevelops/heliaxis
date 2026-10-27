import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { loadDashboard } from '@/lib/crm/dashboard';
import { crmTeam, pipeline } from '@/lib/projects/server';
import { schemaReady } from '@/lib/schema-ready';
import { CrmDashboard } from './CrmDashboard';

export const dynamic = 'force-dynamic';

const PERIODS = [30, 90, 365];

/** CRM › Dashboard: sales, live quotes, how fast we first get back to people, the enquiries not yet in the CRM, and a + to add anything. */
export default async function CrmDashboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const q = await searchParams;
  const days = PERIODS.includes(Number(q.days)) ? Number(q.days) : 30;
  const [dash, pipe, team, schema] = await Promise.all([loadDashboard(days), pipeline(), crmTeam(), schemaReady()]);
  return (
    <AdminShell active="crm" fluid>
      <CrmDashboard dash={dash} me={session.user.id} team={team} unassigned={'error' in pipe ? [] : pipe.unassigned} booking={schema.booking} quotes={schema.quotes} />
    </AdminShell>
  );
}
