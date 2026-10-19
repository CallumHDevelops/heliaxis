import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid, logActivity } from '@/lib/crm/server';
import { ensureOpenSurvey, getProject, isSurveyKind, kindLabel, kindsFor, markCustomerSeen, surveysReady } from '@/lib/surveys/server';
import '../surveys.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Start a survey · Heliaxis',
  robots: { index: false, follow: false },
};

/**
 * /admin/surveys/start?project={id}&type=solar|ashp: opens the job's open survey of that type, making
 * it first if there isn't one (Today on Home links here when a job has a survey date but no survey
 * record yet). Needs signal; surveys booked for today and tomorrow are already on the phone.
 */
export default async function StartSurveyPage({ searchParams }: { searchParams: Promise<{ project?: string; type?: string }> }) {
  const session = await requirePortal('crm');
  const { project: projectId = '', type } = await searchParams;
  let problem: string | null = null;
  let target: string | null = null;

  if (!session) problem = 'You don’t have access to surveys. Ask an admin to give you the CRM.';
  else if (!(await surveysReady())) problem = 'Surveys aren’t set up yet: run surveys.sql in Supabase (see the to-do list on Home).';
  else if (!isUuid(projectId)) problem = 'That job wasn’t found.';
  else {
    const db = createAdminClient();
    const project = await getProject(db, projectId);
    if (!project) problem = 'That job wasn’t found. It may have been deleted.';
    else {
      const kind = isSurveyKind(type) ? type : (kindsFor(project)[0] ?? 'solar');
      const r = await ensureOpenSurvey(db, project, kind, { byId: session.user.id });
      if (!r) problem = 'The survey couldn’t be started. Try again.';
      else {
        if (r.status === 'draft') await markCustomerSeen(db, projectId);
        if (r.created && r.status === 'draft') {
          await logActivity({ enquiryId: project.enquiry_id, projectId, kind: 'visit', body: `${kindLabel(kind)} started`, byId: session.user.id }).catch(() => null);
        }
        target = `/admin/surveys/${r.id}`;
      }
    }
  }
  if (target) redirect(target);

  return (
    <AdminShell active="surveys">
      <div className="svl">
        <p className="svl-empty">{problem}</p>
        <p className="svl-empty">
          <a className="svf-btn" href={isUuid(projectId) ? `/admin/surveys/start?project=${projectId}${type ? `&type=${encodeURIComponent(type)}` : ''}` : '/admin/surveys/todo'}>
            {isUuid(projectId) ? 'Try again' : 'Surveys to do'}
          </a>
        </p>
      </div>
    </AdminShell>
  );
}
