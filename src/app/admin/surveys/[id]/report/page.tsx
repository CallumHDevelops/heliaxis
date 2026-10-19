import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/crm/server';
import { buildPayload, getSurvey, surveysReady } from '@/lib/surveys/server';
import { SurveyReport } from './SurveyReport';
import '../../surveys.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Survey report · Heliaxis',
  robots: { index: false, follow: false },
};

/** The survey as a report: answers by screen, photos with their drawings, red flags, sign-off. Prints to A4. */
export default async function SurveyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePortal('crm');
  if (!session) {
    return (
      <AdminShell active="surveys">
        <p className="svl-empty">You don’t have access to surveys. Ask an admin to give you the CRM.</p>
      </AdminShell>
    );
  }
  if (!(await surveysReady())) {
    return (
      <AdminShell active="surveys">
        <p className="svl-empty">Surveys appear here once surveys.sql has been run in Supabase (see the to-do list on Home).</p>
      </AdminShell>
    );
  }
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = createAdminClient();
  const survey = await getSurvey(db, id);
  if (!survey) notFound();
  const payload = await buildPayload(db, survey);
  if (!payload) notFound();
  return (
    <AdminShell active="surveys">
      <SurveyReport payload={payload} />
    </AdminShell>
  );
}
