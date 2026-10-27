import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { SurveysTabs } from '@/components/admin/SurveysTabs';
import { requirePortal } from '@/lib/auth';
import { isUuid } from '@/lib/crm/server';
import { schemaReady } from '@/lib/schema-ready';
import { ukDate } from '@/lib/booking/engine';
import { DiaryView } from './DiaryView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Diary' };

const todayUk = () => ukDate(Date.now());

/**
 * Surveys → Diary. ?add=1 opens "+ Add to my diary"; ?find=1 opens Find a time (to pick the customer there); ?project={id} opens Find a time for that job
 * (links from the job page and Home's Today list).
 */
export default async function SurveysDiaryPage({ searchParams }: { searchParams: Promise<{ add?: string; project?: string; find?: string }> }) {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const q = await searchParams;
  const ready = (await schemaReady()).booking;
  return (
    <AdminShell active="surveys">
      <SurveysTabs active="diary" admin={session.profile.role === 'admin'} />
      <DiaryView
        ready={ready}
        isAdmin={session.profile.role === 'admin'}
        project={typeof q.project === 'string' && isUuid(q.project) ? q.project : null}
        add={q.add === '1'}
        find={q.find === '1'}
        today={todayUk()}
      />
    </AdminShell>
  );
}
