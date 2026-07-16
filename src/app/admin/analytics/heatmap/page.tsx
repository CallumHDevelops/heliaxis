import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { HeatmapViewer } from '../HeatmapViewer';
import './heatmap.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Click heatmap — Heliaxis CMS',
  robots: { index: false, follow: false },
};

export default async function AdminHeatmapPage() {
  const { profile } = await getSessionProfile();
  const isAdmin = profile?.role === 'admin';

  return (
    <AdminShell active="heatmap" isAdmin={isAdmin} flush>
      <Suspense
        fallback={
          <div className="hm" style={{ padding: '2rem', color: '#6e6a5e' }}>
            Loading heatmap…
          </div>
        }
      >
        <HeatmapViewer />
      </Suspense>
    </AdminShell>
  );
}
