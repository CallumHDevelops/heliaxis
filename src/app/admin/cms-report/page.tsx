import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { reportOverview } from '@/lib/report/build';
import { ReportView } from './ReportView';
import './report.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CMS report — Heliaxis CMS',
  robots: { index: false, follow: false },
};

/** The SEO and GEO report (src/lib/report): what we rank for, where, who beats us and why. */
export default async function CmsReportPage() {
  const session = await requirePortal('cms');
  if (!session) redirect('/admin');
  const overview = await reportOverview();
  return (
    <AdminShell active="report" fluid>
      <ReportView initial={overview} admin={session.profile.role === 'admin'} />
    </AdminShell>
  );
}
