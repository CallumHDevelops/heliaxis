import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { isAiConfigured } from '@/lib/blog/ai';
import { geoOverview } from '@/lib/geo/run';
import { GeoView } from './GeoView';
import './geo.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI search visibility — Heliaxis CMS',
  robots: { index: false, follow: false },
};

/** The GEO bot (src/lib/geo): how often AI assistants name and cite Heliaxis, and what to change. Admins only. */
export default async function GeoPage() {
  const session = await requirePortal('cms');
  if (!session || session.profile.role !== 'admin') redirect('/admin');
  const overview = await geoOverview();
  return (
    <AdminShell active="geo">
      <GeoView initial={overview} blogWriter={isAiConfigured()} />
    </AdminShell>
  );
}
