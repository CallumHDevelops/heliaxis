import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { InstrumentsList } from './InstrumentsList';

export const dynamic = 'force-dynamic';

/** Operations › Test instruments: what the business tests with, and when each one's calibration runs out. */
export default async function InstrumentsPage() {
  const session = await requirePortal('crm');
  if (!session) redirect('/admin?denied=1');
  return (
    <AdminShell active="instruments" fluid>
      <InstrumentsList admin={session.profile.role === 'admin'} />
    </AdminShell>
  );
}
