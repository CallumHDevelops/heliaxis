/** Draw an area on a map, count the homes, save it as a campaign. */
import type { Metadata } from 'next';
import { AdminShell } from '@/components/prospectpv/admin/AdminShell';
import { limitsFromSettings } from '@/lib/prospectpv/mapArea';
import { requireStaff } from '@/lib/prospectpv/server/auth';
import { loadRawSettings } from '@/lib/prospectpv/server/data';
import { MapScreenClient } from '../_screens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Map · ProspectPV', robots: { index: false, follow: false } };

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export default async function MapPage() {
  const { db } = await requireStaff();
  const raw = ((await loadRawSettings(db)).map ?? {}) as Record<string, unknown>;
  const c = Array.isArray(raw.default_center) ? raw.default_center : [];
  const center: [number, number] = [num(c[0], -3.1791), num(c[1], 51.4816)];
  return (
    <AdminShell active="map">
      <MapScreenClient center={center} zoom={num(raw.default_zoom, 12)} limits={limitsFromSettings(raw)} />
    </AdminShell>
  );
}
