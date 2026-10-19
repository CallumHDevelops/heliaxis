import { AdminShell } from '@/components/admin/AdminShell';
import { CrmReports } from './CrmReports';

export const dynamic = 'force-dynamic';

export default function CrmReportsPage() {
  return (
    <AdminShell active="crm" fluid>
      <CrmReports />
    </AdminShell>
  );
}
