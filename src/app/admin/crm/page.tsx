import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { ukDay } from '@/lib/bank-holidays';
import { canAccess } from '@/lib/portals';
import { crmTeam, pipeline } from '@/lib/projects/server';
import { schemaReady } from '@/lib/schema-ready';
import { CrmBoard, type CrmView } from './CrmBoard';

export const dynamic = 'force-dynamic';

const VIEWS: CrmView[] = ['home', 'board', 'list'];
/** ?view= first, then the person's last view (the hx-crm-view cookie, which the WhatsApp dock reads too), then Home. */
const viewOf = (param: unknown, cookie: unknown): CrmView =>
  ([param, cookie].find((v) => VIEWS.includes(v as CrmView)) as CrmView | undefined) ?? 'home';
const ukToday = () => ukDay(Date.now());

/**
 * The CRM: Home (counts, My work, Latest notes, with the WhatsApp dock on the right), Board or List.
 * The pipeline is read here as well, so the first paint already has the real numbers (UK time).
 */
export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const [sp, jar, schema, data, team] = await Promise.all([searchParams, cookies(), schemaReady(), pipeline(), crmTeam()]);
  const view = viewOf(sp.view, jar.get('hx-crm-view')?.value);
  return (
    <AdminShell active="crm" fluid>
      <CrmBoard
        // A new view from the server (the menu, Back) starts the page afresh in that view.
        key={view}
        me={session.user.id}
        initialView={view}
        initial={'error' in data ? null : data}
        schema={schema}
        team={team}
        today={ukToday()}
        canTasks={canAccess(session.profile, 'tasks')}
        canInbox={canAccess(session.profile, 'enquiries')}
      />
    </AdminShell>
  );
}
