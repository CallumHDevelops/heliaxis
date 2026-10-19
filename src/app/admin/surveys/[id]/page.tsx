import type { Metadata } from 'next';
import { requirePortal } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { surveysReady } from '@/lib/surveys/server';
import { SurveyForm } from './SurveyForm';
import '../surveys.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Survey · Heliaxis',
  robots: { index: false, follow: false },
};

/**
 * A survey on the phone. No survey data here on purpose: the form reads the id from the address
 * and loads the survey itself (from the network, or the copy on the phone), so the service worker
 * can keep this page and open it with no signal (src/app/sw.js/route.ts).
 */
export default async function SurveyPage() {
  const session = await requirePortal('crm');
  const ready = session ? await surveysReady() : false;
  return (
    <AdminShell active="surveys">
      {!session ? (
        <p className="svl-empty">You don’t have access to surveys. Ask an admin to give you the CRM.</p>
      ) : !ready ? (
        <p className="svl-empty">Surveys appear here once surveys.sql has been run in Supabase (see the to-do list on Home).</p>
      ) : (
        <SurveyForm />
      )}
    </AdminShell>
  );
}
