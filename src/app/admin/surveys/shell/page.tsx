import type { Metadata } from 'next';
import { requirePortal } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { surveysReady } from '@/lib/surveys/server';
import { SurveyForm } from '../[id]/SurveyForm';
import '../surveys.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Survey · Heliaxis',
  robots: { index: false, follow: false },
};

/**
 * The survey form with no survey in the address. The service worker keeps this page and serves it
 * for any /admin/surveys/{id} it has no copy of, so a survey copied to the phone (the offline pack)
 * still opens after a cold start with no signal: the form reads the id from the address.
 */
export default async function SurveyShellPage() {
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
