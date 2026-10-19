import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { SurveysTabs } from '@/components/admin/SurveysTabs';
import { requirePortal } from '@/lib/auth';
import { BookingSettingsView } from './BookingSettingsView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Survey booking settings' };

/** Surveys → ⚙: survey booking settings. Everyone on the CRM can look; only admins can change them. */
export default async function BookingSettingsPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  const isAdmin = session.profile.role === 'admin';
  return (
    <AdminShell active="surveys">
      <SurveysTabs active="settings" admin={isAdmin} />
      <BookingSettingsView isAdmin={isAdmin} />
    </AdminShell>
  );
}
