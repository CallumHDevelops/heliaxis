import type { Metadata } from 'next';
import { getSessionProfile } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { AssistantView } from './AssistantView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Metis · Heliaxis',
  robots: { index: false, follow: false },
};

export default async function AssistantPage() {
  const { profile } = await getSessionProfile();
  const firstName = (profile?.full_name || profile?.email || '').split(/[\s@]/)[0];
  return (
    <AdminShell active="assistant">
      <AssistantView firstName={firstName} />
    </AdminShell>
  );
}
