import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { ukDay } from '@/lib/bank-holidays';
import { crmTeam, projectsList } from '@/lib/projects/server';
import { schemaReady } from '@/lib/schema-ready';
import { ProjectsBoard, type ProjectsView } from './ProjectsBoard';

export const dynamic = 'force-dynamic';

const VIEWS: ProjectsView[] = ['list', 'schedule', 'board'];
const ukToday = () => ukDay(Date.now());

/**
 * Projects: every job from Won to Complete. List (the default), Schedule (the next 8 weeks of installs)
 * or Board (from 1024px). Read here too, so the first paint has the jobs.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const [sp, schema, team] = await Promise.all([searchParams, schemaReady(), crmTeam()]);
  const view = VIEWS.find((v) => v === sp.view) ?? 'list';
  const data = schema.crmV3 ? await projectsList() : { ready: false, projects: [] };
  return (
    <AdminShell active="crm" fluid>
      <ProjectsBoard key={view} me={session.user.id} initialView={view} initial={data} team={team} today={ukToday()} orders={schema.purchaseOrders} site={schema.site} />
    </AdminShell>
  );
}
