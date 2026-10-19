import type { Metadata } from 'next';
import { requirePortal } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { SurveysTabs } from '@/components/admin/SurveysTabs';
import { surveysReady } from '@/lib/surveys/server';
import { SurveysList } from '../SurveysList';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Surveys to do · Heliaxis',
  robots: { index: false, follow: false },
};

/** No survey data in the page itself: the list reads it (or the phone's copies), so the page works offline too. */
export default async function SurveysTodoPage() {
  const session = await requirePortal('crm');
  const ready = session ? await surveysReady() : false;
  return (
    <AdminShell active="surveys">
      <SurveysTabs active="todo" admin={session?.profile.role === 'admin'} />
      {session ? <SurveysList view="todo" ready={ready} /> : <p className="svl-empty">You don’t have access to surveys. Ask an admin to give you the CRM.</p>}
    </AdminShell>
  );
}
