import { AdminShell } from '@/components/admin/AdminShell';
import { LeadsMap } from './LeadsMap';

export const dynamic = 'force-dynamic';

/** CRM → Leads map: where the leads come from, by postcode area, coloured by where they found us. */
export default async function LeadsMapPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  return (
    <AdminShell active="crm" fluid>
      <LeadsMap initialDays={[30, 90, 180, 365].includes(Number(days)) ? Number(days) : 90} />
    </AdminShell>
  );
}
