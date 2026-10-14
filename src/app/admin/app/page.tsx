import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/AdminShell';
import release from '../../../../public/app/version.json';
import { AppDownload } from './AppDownload';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Android app · Heliaxis',
  robots: { index: false, follow: false },
};

export default function AppPage() {
  return (
    <AdminShell active="app">
      <AppDownload release={release} />
    </AdminShell>
  );
}
